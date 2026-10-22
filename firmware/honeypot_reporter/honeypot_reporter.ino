/*
 * Mini IoT Honeypot - ESP8266 reference reporter
 *
 * Hosts a small decoy web server on port 80 and forwards an observation of every request it
 * receives to the backend (POST /api/events/ingest). Sends heartbeats with RSSI, uptime and free
 * heap, and honours the backend's recommendedAction ("rate-limit" -> 429, "block" -> 403) for a
 * client until retryAfterSeconds expires.
 *
 * Network portability: up to three Wi-Fi profiles (e.g. phone hotspot and college Wi-Fi), each
 * with its own backend URL from secrets.h. The URL can be changed at runtime from the Serial
 * Monitor (115200 baud, newline) without reflashing:
 *   help | status | test | url http://<laptop-ip>:4000 | url reset
 *
 * Reference implementation for the contract in firmware/README.md. Compiles cleanly with ESP8266
 * core 3.1.2 (NodeMCU 1.0, Wemos D1 mini) but has not been run on a physical board; verify it.
 * Board: any ESP8266 with the ESP8266 Arduino core 3.x. Credentials live in secrets.h only.
 */
#include <EEPROM.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
#include <ESP8266WiFiMulti.h>
#include <WiFiClient.h>

#include "secrets.h"

static const char *FIRMWARE_VERSION = "1.1.0";
static const uint32_t HTTP_TIMEOUT_MS = 3000;
static const uint16_t MAX_PATH_LENGTH = 512;
static const uint8_t QUEUE_SIZE = 16;
static const uint8_t MAX_DECISIONS = 8;
static const uint32_t SETTINGS_MAGIC = 0x48504f54;  // "HPOT"
// Time allowed per join attempt (association + WPA2 handshake + DHCP). The library default of 5 s
// is too short for iPhone Personal Hotspot, which often needs longer; a timed-out attempt is then
// aborted by the next run()'s scan/disconnect, so the board never finishes joining.
static const uint32_t WIFI_JOIN_TIMEOUT_MS = 20000;

ESP8266WebServer server(80);
ESP8266WiFiMulti wifiMulti;

// ---------------------------------------------------------------------------------------------
// Wi-Fi profiles and the backend URL
// ---------------------------------------------------------------------------------------------
struct WifiProfile {
  const char *ssid;
  const char *password;
  const char *backendUrl;
};
const WifiProfile PROFILES[] = {
    {WIFI_1_SSID, WIFI_1_PASSWORD, WIFI_1_BACKEND_URL},
    {WIFI_2_SSID, WIFI_2_PASSWORD, WIFI_2_BACKEND_URL},
    {WIFI_3_SSID, WIFI_3_PASSWORD, WIFI_3_BACKEND_URL},
};

// Runtime override typed in the Serial Monitor, persisted in flash for one SSID.
struct SavedSettings {
  uint32_t magic;
  char ssid[33];
  char url[100];
};
SavedSettings saved;

// Backend decisions applied locally (application layer only). Declared before any function
// because the Arduino builder inserts auto-generated prototypes above the first function.
struct Decision {
  IPAddress ip;
  uint8_t action;  // 1 = rate-limit (HTTP 429), 2 = block (HTTP 403)
  uint32_t untilMs;
};
Decision decisions[MAX_DECISIONS];

String backendUrl;        // effective URL for the current network ("" = unknown)
String backendUrlSource;  // "secrets.h", "saved override" or "none"
IPAddress lastLocalIp;

void loadSaved() {
  EEPROM.begin(sizeof(SavedSettings));
  EEPROM.get(0, saved);
  if (saved.magic != SETTINGS_MAGIC) memset(&saved, 0, sizeof(saved));
}

void storeSaved() {
  saved.magic = SETTINGS_MAGIC;
  EEPROM.put(0, saved);
  EEPROM.commit();
}

void resolveBackendUrl() {
  String ssid = WiFi.SSID();
  if (saved.magic == SETTINGS_MAGIC && ssid == saved.ssid && strlen(saved.url)) {
    backendUrl = saved.url;
    backendUrlSource = "saved override";
    return;
  }
  for (const auto &p : PROFILES) {
    if (strlen(p.ssid) && ssid == p.ssid && strlen(p.backendUrl)) {
      backendUrl = p.backendUrl;
      backendUrlSource = "secrets.h";
      return;
    }
  }
  backendUrl = "";
  backendUrlSource = "none";
}

// Extracts the host part of "http://host:port/...".
String urlHost(const String &url) {
  int start = url.indexOf("://");
  start = start < 0 ? 0 : start + 3;
  int end = start;
  while (end < (int)url.length() && url[end] != ':' && url[end] != '/') end++;
  return url.substring(start, end);
}

// True if the backend host is an IP inside the subnet this board is on.
bool backendInSubnet() {
  IPAddress host;
  if (!host.fromString(urlHost(backendUrl))) return false;
  IPAddress mask = WiFi.subnetMask();
  IPAddress local = WiFi.localIP();
  for (int i = 0; i < 4; i++) {
    if ((host[i] & mask[i]) != (local[i] & mask[i])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Observation queue: handlers enqueue, loop() sends one at a time so serving is never blocked.
// ---------------------------------------------------------------------------------------------
struct Observation {
  String method;
  String path;
  String query;
  String clientIp;
  String userAgent;
  int status;
  int8_t loginResult;  // -1 none, 0 failed, 1 success
  uint32_t bodyBytes;
  uint32_t uptimeMs;
  uint32_t seq;
};

Observation queueBuf[QUEUE_SIZE];
uint8_t queueHead = 0;
uint8_t queueCount = 0;
uint32_t bootId = 0;
uint32_t nextSeq = 1;
uint32_t droppedObservations = 0;

bool registered = false;
uint32_t nextSendAt = 0;
uint32_t sendBackoffMs = 1000;
uint32_t nextHeartbeatAt = 0;
uint32_t heartbeatIntervalMs = 30000;
int lastBackendCode = 0;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
String jsonEscape(const String &in) {
  String out;
  out.reserve(in.length() + 8);
  for (size_t i = 0; i < in.length(); i++) {
    char c = in[i];
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if ((uint8_t)c < 0x20) {
          char buf[7];
          snprintf(buf, sizeof(buf), "\\u%04x", (uint8_t)c);
          out += buf;
        } else {
          out += c;
        }
    }
  }
  return out;
}

bool isSensitiveName(String name) {
  name.toLowerCase();
  return name.indexOf("pass") >= 0 || name.indexOf("pwd") >= 0 || name.indexOf("token") >= 0 ||
         name.indexOf("secret") >= 0 || name.indexOf("key") >= 0 || name.indexOf("auth") >= 0 ||
         name.indexOf("session") >= 0;
}

// Rebuilds the query string from parsed args. Sensitive values are redacted on the device as
// well (defence in depth; the backend redacts again). The POST body ("plain") is never sent.
String buildQuery() {
  String q;
  for (int i = 0; i < server.args(); i++) {
    String name = server.argName(i);
    if (name == "plain") continue;
    if (q.length()) q += "&";
    q += name + "=" + (isSensitiveName(name) ? String("[REDACTED]") : server.arg(i));
    if (q.length() > 512) break;
  }
  return q;
}

const char *methodName(HTTPMethod m) {
  switch (m) {
    case HTTP_GET: return "GET";
    case HTTP_POST: return "POST";
    case HTTP_PUT: return "PUT";
    case HTTP_PATCH: return "PATCH";
    case HTTP_DELETE: return "DELETE";
    case HTTP_OPTIONS: return "OPTIONS";
    case HTTP_HEAD: return "HEAD";
    default: return "OTHER";
  }
}

void record(int status, int8_t loginResult = -1) {
  if (queueCount == QUEUE_SIZE) {
    // Queue full: drop the oldest observation rather than block the web server.
    queueHead = (queueHead + 1) % QUEUE_SIZE;
    queueCount--;
    droppedObservations++;
  }
  Observation &o = queueBuf[(queueHead + queueCount) % QUEUE_SIZE];
  o.method = methodName(server.method());
  o.path = server.uri().substring(0, MAX_PATH_LENGTH);
  o.query = buildQuery();
  o.clientIp = server.client().remoteIP().toString();
  o.userAgent = server.header("User-Agent").substring(0, 200);
  o.status = status;
  o.loginResult = loginResult;
  o.bodyBytes = server.hasArg("plain") ? server.arg("plain").length() : 0;
  o.uptimeMs = millis();
  o.seq = nextSeq++;
  queueCount++;
}

Decision *findDecision(const IPAddress &ip) {
  uint32_t now = millis();
  for (auto &d : decisions) {
    if (d.action && (int32_t)(d.untilMs - now) > 0 && d.ip == ip) return &d;
  }
  return nullptr;
}

void storeDecision(const String &ipText, uint8_t action, uint32_t seconds) {
  IPAddress ip;
  if (!ip.fromString(ipText)) return;
  uint32_t until = millis() + seconds * 1000UL;
  Decision *slot = nullptr;
  for (auto &d : decisions) {
    if (d.ip == ip || !d.action || (int32_t)(d.untilMs - millis()) <= 0) {
      slot = &d;
      break;
    }
  }
  if (!slot) slot = &decisions[0];
  slot->ip = ip;
  slot->action = action;
  slot->untilMs = until;
}

// Returns true if the request was answered because of an active backend decision.
bool enforceDecision() {
  Decision *d = findDecision(server.client().remoteIP());
  if (!d) return false;
  int status = d->action == 2 ? 403 : 429;
  record(status);
  server.send(status, "text/plain", d->action == 2 ? "Forbidden" : "Too Many Requests");
  return true;
}

int httpRequest(const char *method, const String &path, const String &body, String &response) {
  if (!backendUrl.length()) return -100;  // no URL configured for this network
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, backendUrl + path)) return -101;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);
  int code = strcmp(method, "GET") == 0 ? http.GET() : http.POST(body);
  response = code > 0 ? http.getString() : "";
  http.end();
  lastBackendCode = code;
  return code;
}

int postJson(const String &path, const String &body, String &response) {
  return httpRequest("POST", path, body, response);
}

// Minimal extraction of "key":"value" / "key":number from the small backend responses.
String jsonField(const String &json, const char *key) {
  String needle = String("\"") + key + "\":";
  int at = json.indexOf(needle);
  if (at < 0) return "";
  at += needle.length();
  if (json[at] == '"') {
    int end = json.indexOf('"', at + 1);
    return end > at ? json.substring(at + 1, end) : "";
  }
  int end = at;
  while (end < (int)json.length() && (isDigit(json[end]) || json[end] == '-')) end++;
  return json.substring(at, end);
}

// Human-readable guidance for a failed backend call.
void printConnectivityHints(int code) {
  if (code == -100) {
    Serial.println("  No backend URL for this Wi-Fi. Type: url http://<laptop-ip>:4000  (find it with ipconfig on the laptop)");
    return;
  }
  if (code == 401) {
    Serial.println("  Reached the backend, but DEVICE_API_KEY in secrets.h does not match backend/.env.");
    return;
  }
  if (code > 0) return;
  Serial.println("  Could not reach the backend. Check, in order:");
  if (!backendInSubnet()) {
    Serial.printf("  - The backend IP %s is NOT in this board's subnet (%s / %s). Wrong or changed laptop IP?\n",
                  urlHost(backendUrl).c_str(), WiFi.localIP().toString().c_str(), WiFi.subnetMask().toString().c_str());
  }
  Serial.println("  - Laptop IP changed? Run ipconfig on the laptop, then: url http://<new-ip>:4000");
  Serial.println("  - Backend running with HOST=0.0.0.0? (npm run dev; npm run network-check)");
  Serial.println("  - Windows Firewall: TCP 4000 allowed for this network? (backend/scripts/firewall-rule.ps1)");
  Serial.println("  - Client isolation: open http://<laptop-ip>:4000/api/health from a phone on the same Wi-Fi.");
  Serial.println("    If the phone cannot load it either, the Wi-Fi blocks device-to-device traffic: use your phone hotspot.");
}

// ---------------------------------------------------------------------------------------------
// Backend communication
// ---------------------------------------------------------------------------------------------
void registerDevice() {
  String body = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"name\":\"" + jsonEscape(DEVICE_NAME) +
                "\",\"hardware\":\"ESP8266\",\"firmwareVersion\":\"" + FIRMWARE_VERSION +
                "\",\"ipAddress\":\"" + WiFi.localIP().toString() + "\"}";
  String response;
  int code = postJson("/api/devices/register", body, response);
  Serial.printf("[register] %s -> HTTP %d\n", backendUrl.c_str(), code);
  if (code == 200 || code == 201) {
    registered = true;
    String interval = jsonField(response, "recommendedHeartbeatIntervalSeconds");
    if (interval.length()) heartbeatIntervalMs = interval.toInt() * 1000UL;
    nextHeartbeatAt = 0;  // send the first heartbeat immediately
  } else {
    printConnectivityHints(code);
  }
}

void sendHeartbeat() {
  String body = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"firmwareVersion\":\"" + FIRMWARE_VERSION +
                "\",\"ipAddress\":\"" + WiFi.localIP().toString() + "\",\"rssi\":" + String(WiFi.RSSI()) +
                ",\"uptimeMs\":" + String(millis()) + ",\"freeHeap\":" + String(ESP.getFreeHeap()) + "}";
  String response;
  int code = postJson("/api/devices/heartbeat", body, response);
  Serial.printf("[heartbeat] HTTP %d rssi=%d heap=%u\n", code, WiFi.RSSI(), ESP.getFreeHeap());
  if (code == 404) registered = false;  // backend lost the registration: re-register
  if (code <= 0) printConnectivityHints(code);
  String next = jsonField(response, "nextHeartbeatSeconds");
  if (next.length()) heartbeatIntervalMs = next.toInt() * 1000UL;
}

void flushOneObservation() {
  if (!queueCount || (int32_t)(millis() - nextSendAt) < 0) return;
  Observation &o = queueBuf[queueHead];

  char correlationId[48];
  snprintf(correlationId, sizeof(correlationId), "%s:%08x:%u", DEVICE_ID, bootId, o.seq);

  String body;
  body.reserve(256 + o.path.length() + o.query.length() + o.userAgent.length());
  body += "{\"deviceId\":\"" DEVICE_ID "\"";
  body += ",\"clientIp\":\"" + o.clientIp + "\"";
  body += ",\"method\":\"" + o.method + "\"";
  body += ",\"path\":\"" + jsonEscape(o.path) + "\"";
  if (o.query.length()) body += ",\"query\":\"" + jsonEscape(o.query) + "\"";
  body += ",\"responseStatus\":" + String(o.status);
  if (o.userAgent.length()) body += ",\"userAgent\":\"" + jsonEscape(o.userAgent) + "\"";
  if (o.loginResult >= 0) body += String(",\"loginResult\":\"") + (o.loginResult ? "success" : "failed") + "\"";
  body += ",\"bodyBytes\":" + String(o.bodyBytes);
  body += ",\"uptimeMs\":" + String(o.uptimeMs);
  body += String(",\"correlationId\":\"") + correlationId + "\"}";

  String response;
  int code = postJson("/api/events/ingest", body, response);

  if (code == 200 || code == 201) {
    String action = jsonField(response, "recommendedAction");
    String retry = jsonField(response, "retryAfterSeconds");
    if ((action == "rate-limit" || action == "block") && retry.length()) {
      storeDecision(o.clientIp, action == "block" ? 2 : 1, retry.toInt());
    }
    queueHead = (queueHead + 1) % QUEUE_SIZE;
    queueCount--;
    sendBackoffMs = 1000;
    nextSendAt = millis() + 50;
  } else if (code == 400 || code == 401 || code == 413) {
    // Not retryable: drop it and log the reason.
    Serial.printf("[ingest] dropped observation, HTTP %d: %s\n", code, response.c_str());
    queueHead = (queueHead + 1) % QUEUE_SIZE;
    queueCount--;
  } else {
    // Network error, 404 (not registered), 429 or 5xx: keep it and retry with backoff.
    // The correlationId makes retries idempotent on the backend.
    if (code == 404) registered = false;
    Serial.printf("[ingest] HTTP %d, retrying in %ums\n", code, sendBackoffMs);
    nextSendAt = millis() + sendBackoffMs;
    sendBackoffMs = sendBackoffMs >= 15000 ? 30000 : sendBackoffMs * 2;
  }
}

// ---------------------------------------------------------------------------------------------
// Serial console: change the backend URL without reflashing, and diagnose connectivity.
// ---------------------------------------------------------------------------------------------
void printStatus() {
  Serial.printf("firmware %s, device %s\n", FIRMWARE_VERSION, DEVICE_ID);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("wifi: %s  ip=%s  mask=%s  gateway=%s  rssi=%d dBm\n", WiFi.SSID().c_str(),
                  WiFi.localIP().toString().c_str(), WiFi.subnetMask().toString().c_str(),
                  WiFi.gatewayIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("wifi: not connected (check SSIDs/passwords in secrets.h and that the network is 2.4 GHz)");
  }
  Serial.printf("backend: %s (%s)%s\n", backendUrl.length() ? backendUrl.c_str() : "(none)", backendUrlSource.c_str(),
                backendUrl.length() && !backendInSubnet() ? "  WARNING: not in this board's subnet" : "");
  Serial.printf("registered=%s  last backend HTTP=%d  queued=%u  dropped=%u\n", registered ? "yes" : "no",
                lastBackendCode, queueCount, droppedObservations);
}

void runConnectivityTest() {
  printStatus();
  String response;
  int code = httpRequest("GET", "/api/health", "", response);
  Serial.printf("[test] GET %s/api/health -> HTTP %d\n", backendUrl.c_str(), code);
  if (code == 200) {
    Serial.printf("  OK: backend status %s\n", jsonField(response, "status").c_str());
  } else {
    printConnectivityHints(code);
  }
}

void handleSerialCommand(String line) {
  line.trim();
  if (!line.length()) return;
  if (line == "help") {
    Serial.println("commands: status | test | url http://<laptop-ip>:4000 | url reset");
  } else if (line == "status") {
    printStatus();
  } else if (line == "test") {
    runConnectivityTest();
  } else if (line == "url reset") {
    memset(&saved, 0, sizeof(saved));
    storeSaved();
    resolveBackendUrl();
    registered = false;
    Serial.printf("override cleared; backend now %s (%s)\n", backendUrl.c_str(), backendUrlSource.c_str());
  } else if (line.startsWith("url ")) {
    String url = line.substring(4);
    url.trim();
    while (url.endsWith("/")) url.remove(url.length() - 1);
    if (!url.startsWith("http://") || url.length() >= sizeof(saved.url) || urlHost(url).length() == 0) {
      Serial.println("invalid URL. Example: url http://192.168.43.10:4000");
      return;
    }
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("connect to Wi-Fi first: the override is saved for the current network");
      return;
    }
    saved.magic = SETTINGS_MAGIC;
    strncpy(saved.ssid, WiFi.SSID().c_str(), sizeof(saved.ssid) - 1);
    saved.ssid[sizeof(saved.ssid) - 1] = '\0';
    strncpy(saved.url, url.c_str(), sizeof(saved.url) - 1);
    saved.url[sizeof(saved.url) - 1] = '\0';
    storeSaved();
    resolveBackendUrl();
    registered = false;  // re-register against the new backend
    Serial.printf("saved backend %s for Wi-Fi \"%s\"\n", backendUrl.c_str(), saved.ssid);
    runConnectivityTest();
  } else {
    Serial.println("unknown command; type help");
  }
}

void pollSerial() {
  static String line;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      handleSerialCommand(line);
      line = "";
    } else if (line.length() < 160) {
      line += c;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Decoy routes. The login endpoint never checks or stores credentials: every attempt fails.
// ---------------------------------------------------------------------------------------------
void handleRoot() {
  if (enforceDecision()) return;
  record(200);
  server.send(200, "text/html", "<html><body><h1>Smart Sensor Hub</h1><a href=\"/login\">Admin login</a></body></html>");
}

void handleStatus() {
  if (enforceDecision()) return;
  record(200);
  server.send(200, "application/json", "{\"status\":\"ok\"}");
}

void handleLoginPage() {
  if (enforceDecision()) return;
  record(200);
  server.send(200, "text/html",
              "<form method=\"POST\" action=\"/login\"><input name=\"user\"><input name=\"password\" type=\"password\">"
              "<button>Sign in</button></form>");
}

void handleLoginSubmit() {
  if (enforceDecision()) return;
  record(401, 0);  // loginResult = failed; submitted values are not forwarded
  server.send(401, "text/plain", "Invalid credentials");
}

void handleNotFound() {
  if (enforceDecision()) return;
  record(404);
  server.send(404, "text/plain", "Not found");
}

// ---------------------------------------------------------------------------------------------
// Wi-Fi diagnostics (never prints passwords or keys)
// ---------------------------------------------------------------------------------------------
const char *wifiStatusText(int status) {
  switch (status) {
    case WL_IDLE_STATUS: return "idle: join did not finish in time";
    case WL_NO_SSID_AVAIL: return "SSID not found";
    case WL_CONNECT_FAILED: return "connection failed";
    case WL_CONNECTION_LOST: return "connection lost";
    case WL_WRONG_PASSWORD: return "wrong password";
    case WL_DISCONNECTED: return "disconnected: association/handshake/DHCP did not finish";
    default: return "other";
  }
}

const char *encryptionText(uint8_t type) {
  switch (type) {
    case ENC_TYPE_NONE: return "open";
    case ENC_TYPE_WEP: return "WEP";
    case ENC_TYPE_TKIP: return "WPA (TKIP)";
    case ENC_TYPE_CCMP: return "WPA2 (CCMP)";
    case ENC_TYPE_AUTO: return "WPA/WPA2 auto";
    default: return "unknown (possibly WPA3, unsupported by ESP8266)";
  }
}

void printWifiProfiles() {
  for (const auto &p : PROFILES) {
    if (!strlen(p.ssid)) continue;
    size_t len = strlen(p.password);
    Serial.printf("[wifi] profile \"%s\": password %s\n", p.ssid,
                  len == 0 ? "EMPTY" : (len < 8 || len > 63) ? "set but INVALID length (WPA2 needs 8-63 chars)" : "set");
  }
}

// Called after a failed join: explains why using the status code and the scan wifiMulti just ran.
void printWifiDiagnostics() {
  int status = WiFi.status();
  Serial.printf("[wifi] not connected: status %d = %s\n", status, wifiStatusText(status));
  int found = WiFi.scanComplete();
  if (found < 0) {
    Serial.println("[wifi] no scan results available");
    return;
  }
  bool seen = false;
  for (int i = 0; i < found; i++) {
    for (const auto &p : PROFILES) {
      if (strlen(p.ssid) && WiFi.SSID(i) == p.ssid) {
        seen = true;
        Serial.printf("[wifi] \"%s\" is visible: channel %d, RSSI %d dBm, security %s\n", p.ssid, WiFi.channel(i),
                      WiFi.RSSI(i), encryptionText(WiFi.encryptionType(i)));
      }
    }
  }
  if (!seen) {
    Serial.printf("[wifi] configured SSID not among %d visible 2.4 GHz networks. On the iPhone: Settings >\n", found);
    Serial.println("       Personal Hotspot > turn ON 'Maximize Compatibility' and keep that screen open while joining.");
  } else if (status == WL_WRONG_PASSWORD) {
    Serial.println("[wifi] the hotspot rejected the password: re-check WIFI_1_PASSWORD in secrets.h (case-sensitive).");
  }
}

// ---------------------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(100);
  bootId = ESP.random();
  loadSaved();

  WiFi.mode(WIFI_STA);
  for (const auto &p : PROFILES) {
    if (strlen(p.ssid)) wifiMulti.addAP(p.ssid, p.password);
  }
  printWifiProfiles();

  // Core 3.1.x takes header names as variadic arguments.
  server.collectHeaders("User-Agent", "Content-Type");
  server.on("/", HTTP_GET, handleRoot);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/login", HTTP_GET, handleLoginPage);
  server.on("/login", HTTP_POST, handleLoginSubmit);
  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("[http] decoy server listening on port 80. Type 'help' for serial commands.");
}

void loop() {
  pollSerial();

  // Joins the strongest configured network and reconnects automatically.
  if (wifiMulti.run(WIFI_JOIN_TIMEOUT_MS) != WL_CONNECTED) {
    printWifiDiagnostics();  // each failed run() already took a scan + up to 20 s, so this is not spammy
    return;
  }

  // New network or new DHCP address: pick the matching backend URL and re-register.
  if (WiFi.localIP() != lastLocalIp) {
    lastLocalIp = WiFi.localIP();
    resolveBackendUrl();
    registered = false;
    Serial.printf("[wifi] %s ip=%s mask=%s rssi=%d | backend %s (%s)\n", WiFi.SSID().c_str(),
                  lastLocalIp.toString().c_str(), WiFi.subnetMask().toString().c_str(), WiFi.RSSI(),
                  backendUrl.length() ? backendUrl.c_str() : "(none)", backendUrlSource.c_str());
  }

  server.handleClient();

  if (!registered) {
    static uint32_t lastRegister = 0;
    if (lastRegister == 0 || millis() - lastRegister > 15000) {
      lastRegister = millis();
      registerDevice();
    }
    return;
  }

  if ((int32_t)(millis() - nextHeartbeatAt) >= 0) {
    nextHeartbeatAt = millis() + heartbeatIntervalMs;
    sendHeartbeat();
  }

  flushOneObservation();
}

# ESP8266 integration guide

This guide covers how an ESP8266 reports to the backend: how to provision it, the exact HTTP contract, and a reference sketch.

> **Status of the reference sketch:** [`honeypot_reporter/honeypot_reporter.ino`](honeypot_reporter/honeypot_reporter.ino) implements the contract below. It **compiles without warnings** (`-Wall`) with arduino-cli and ESP8266 core 3.1.2 for NodeMCU 1.0 (`esp8266:esp8266:nodemcuv2`) and Wemos D1 mini. It uses about 41% of RAM and 27% of flash. It has **not been flashed or run on a physical board**, so verify Wi-Fi, registration and event reporting on your hardware. The backend side of the contract is covered by automated tests.

## What the backend can and cannot see

The ESP8266 hosts its own decoy web server. HTTP requests that reach the board **never pass through the laptop**, so the backend cannot observe them on its own. It only knows what the firmware explicitly forwards:

| Data | Who measures it |
| --- | --- |
| Method, path, query, response status, client IP, User-Agent | The firmware's web server, which forwards them per request |
| Login result on the decoy `/login` | The firmware (it always fails; credentials are never read or forwarded) |
| Wi-Fi RSSI, uptime, free heap | The firmware (`WiFi.RSSI()`, `millis()`, `ESP.getFreeHeap()`) in heartbeats |
| Online/offline | The backend, from heartbeat timing only |
| Severity, classification, action | The backend detection engine only. Client-supplied values are ignored. |

## Provisioning

1. In `backend/.env`, set a long random `DEVICE_API_KEY` (at least 16 characters):
   `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
2. Start the backend with `HOST=0.0.0.0` (the default) so it is reachable on the LAN. Then add a **narrowly scoped** firewall exception: TCP 4000, `node.exe` only, local subnet or the board's IP only. Use `backend/scripts/firewall-rule.ps1` as described in [docs/NETWORKING.md](../docs/NETWORKING.md#windows-firewall-narrow-exceptions-only). Never disable the firewall.
3. Find the laptop's IPv4 address on the network the board will use: run `ipconfig`, or `cd backend; npm run network-check`, or look at the dashboard's **Devices** page.
4. Copy `honeypot_reporter/secrets.example.h` to `honeypot_reporter/secrets.h`. Fill in up to three Wi-Fi profiles, each with SSID, password and backend URL (e.g. phone hotspot and college Wi-Fi), plus `DEVICE_API_KEY` and a unique `DEVICE_ID`. `secrets.h` is git-ignored.
5. In the Arduino IDE, install the **ESP8266 boards package** (Boards Manager → "esp8266" by ESP8266 Community, 3.x). Select your board (e.g. *NodeMCU 1.0*) and upload. No extra libraries are needed.
6. Open the Serial Monitor at 115200 baud with line ending "Newline". You should see `[wifi] <ssid> ip=...`, `[register] ... HTTP 201`, then `[heartbeat] HTTP 200`. The device turns **Online** on the Devices page and in the top bar's **ESP8266** chip.
7. Browse to `http://<esp-ip>/`, `/login` and `/does-not-exist` from a phone on the same Wi-Fi. Events appear live in the dashboard marked **ESP8266**.

## Changing networks or a changed laptop IP (no reflash)

The board joins the strongest of the Wi-Fi profiles in `secrets.h` and uses that profile's backend URL. When it gets a new IP it picks the matching URL and re-registers automatically. If the laptop's IP has changed, type into the Serial Monitor:

| Command | Effect |
| --- | --- |
| `url http://<laptop-ip>:4000` | Saves this URL in flash for the **current** Wi-Fi network, re-registers and runs `test` |
| `url reset` | Removes the saved override; the `secrets.h` URL is used again |
| `status` | Board IP, subnet mask, gateway, RSSI, backend URL and where it came from, last HTTP code, queue size |
| `test` | `GET /api/health`, then hints: wrong or changed IP, different subnet, firewall, client isolation, wrong key |
| `help` | Lists the commands |

The full connectivity checklist (firewall, subnets, hotspot or college client isolation, captive portals, 5 GHz) is in [docs/NETWORKING.md](../docs/NETWORKING.md#connectivity-troubleshooting-checklist).

## Authentication

Every device request must include:

```
X-Device-Key: <DEVICE_API_KEY>
Content-Type: application/json
```

The backend compares the key in constant time. It never returns it and redacts it from stored headers. **Limitations:** this is one shared key for all devices. Anyone who extracts it from a board's flash can impersonate any `deviceId`, and traffic is plain HTTP on the LAN. For production you would use per-device credentials issued at provisioning, HTTPS/TLS (or mutual TLS), and key rotation. The dashboard never handles the device key.

## Endpoints

Base URL: `http://<laptop-lan-ip>:4000`. Maximum request body: **8 KB** (aim for under 1 KB). Use HTTP/1.1 with a **3 second** timeout.

### 1. Register (on boot) - `POST /api/devices/register`

```json
{ "deviceId": "esp8266-lab-01", "name": "Lab honeypot", "hardware": "ESP8266", "firmwareVersion": "1.0.0", "ipAddress": "192.168.1.40" }
```

Required: `deviceId` (3-64 chars `[A-Za-z0-9_-]`). Optional: `name`, `hardware`, `firmwareVersion`, `ipAddress`.
Response `201` (new) or `200` (already registered):

```json
{ "data": { "deviceId": "esp8266-lab-01", "created": true, "status": "never-connected", "recommendedHeartbeatIntervalSeconds": 30 } }
```

### 2. Heartbeat (every ~30 s) - `POST /api/devices/heartbeat`

```json
{ "deviceId": "esp8266-lab-01", "firmwareVersion": "1.0.0", "ipAddress": "192.168.1.40", "rssi": -61, "uptimeMs": 123456, "freeHeap": 31000 }
```

Required: `deviceId`. Optional: `firmwareVersion`, `ipAddress`, `rssi` (integer -127..0 dBm), `uptimeMs`, `freeHeap`.
Response `200`:

```json
{ "data": { "deviceId": "esp8266-lab-01", "status": "online", "serverTime": "2026-10-22T17:30:00.000Z", "nextHeartbeatSeconds": 30 } }
```

The device shows **Offline** when no heartbeat arrives within `heartbeatTimeoutSeconds` (default 90 s, editable in Settings). The interval must stay below that timeout.

### 3. Report an observation - `POST /api/events/ingest`

```json
{
  "deviceId": "esp8266-lab-01",
  "clientIp": "192.168.1.77",
  "method": "POST",
  "path": "/login",
  "query": "user=admin&password=[REDACTED]",
  "responseStatus": 401,
  "userAgent": "curl/8.5.0",
  "loginResult": "failed",
  "headers": { "content-type": "application/x-www-form-urlencoded" },
  "bodyBytes": 31,
  "uptimeMs": 523311,
  "correlationId": "esp8266-lab-01:3fa2c91b:42"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `deviceId` | yes | Must be registered first |
| `method` | yes | HTTP method token (letters, `-`, `_`), max 16 |
| `path` | yes | Max 2048 chars; a `?query` suffix is split off automatically |
| `clientIp` | recommended | IPv4/IPv6 of the client that hit the ESP8266 |
| `sourceIdentifier` | optional | Used when no IP is known |
| `query` | optional | Sensitive parameter values are redacted server-side too |
| `responseStatus` | recommended | Needed by the repeated-404 rule |
| `loginResult` | optional | `"failed"` or `"success"` for the designated test login endpoint |
| `userAgent`, `headers` (≤30), `bodyBytes`, `uptimeMs` | optional | Authorization, cookie and token headers are stored as `[REDACTED]` |
| `observedAt` | optional | ISO timestamp, only if the device syncs NTP; the server receive time is authoritative |
| `correlationId` | recommended | 8-64 chars `[A-Za-z0-9_.:-]`, unique per observation; makes retries idempotent |

Unknown fields are discarded. **Never send passwords or request bodies.** Fields such as `severity`, `classification`, `actionTaken` or `simulated` are ignored.

Response `201` (new) or `200` (duplicate `correlationId`):

```json
{
  "data": {
    "eventId": "6717d4...",
    "severity": "high",
    "classification": "high-risk",
    "category": "repeated-failed-login",
    "actionTaken": "blocked",
    "recommendedAction": "block",
    "retryAfterSeconds": 300,
    "duplicate": false
  }
}
```

`recommendedAction` is one of `allow | log | rate-limit | block`. The reference firmware answers that client with HTTP 429 (rate-limit) or 403 (block) until `retryAfterSeconds` expires. This is **application-layer** enforcement on the honeypot only; nothing is blocked at the network level.

## Status codes and retry policy

| Code | Meaning | Device action |
| --- | --- | --- |
| 200 / 201 | Stored (or duplicate of a stored event) | Remove from queue |
| 400 | Validation failed (`error.details` lists fields) | Drop and log; fix firmware |
| 401 | Missing/invalid `X-Device-Key` | Stop and fix provisioning |
| 404 `DEVICE_NOT_REGISTERED` | Device unknown | Re-register, then retry |
| 413 | Body over 8 KB | Drop; truncate fields |
| 429 `RATE_LIMITED` | Device API limit (default 240/min per IP) | Back off for `retryAfterSeconds` |
| 503 `DATABASE_UNAVAILABLE` | MongoDB down; nothing stored | Keep in queue, retry with backoff |
| network error / timeout | Backend unreachable | Keep in queue, retry with backoff |

Recommended backoff: 1 s doubling to 30 s. Keep a small bounded queue (the sketch uses 16 entries and drops the oldest when full). Reuse the same `correlationId` when retrying.

## Minimal Arduino POST example

```cpp
#include <ESP8266HTTPClient.h>
#include <ESP8266WiFi.h>
#include <WiFiClient.h>
#include "secrets.h"

int reportObservation(const String& clientIp, const String& method, const String& path, int status) {
  WiFiClient client;
  HTTPClient http;
  // backendUrl comes from the active Wi-Fi profile or the serial `url` override (see the sketch).
  if (!http.begin(client, backendUrl + "/api/events/ingest")) return -1;
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);
  // Escape path for JSON in real code (see jsonEscape() in the reference sketch).
  String body = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"clientIp\":\"" + clientIp +
                "\",\"method\":\"" + method + "\",\"path\":\"" + path +
                "\",\"responseStatus\":" + status + "}";
  int code = http.POST(body);
  String response = http.getString();  // contains recommendedAction
  http.end();
  return code;
}
```

## Testing the contract without a board

Run these from the laptop. They create a real device record named `manual-test-device`, which shows on the Devices page as an ESP8266 because it uses the device endpoints. Use the **Controlled testing** page instead if you want clearly simulated data.

```powershell
$key = "<DEVICE_API_KEY from backend/.env>"
$h = @{ "X-Device-Key" = $key }
Invoke-RestMethod -Method Post http://localhost:4000/api/devices/register -Headers $h -ContentType application/json -Body '{"deviceId":"manual-test-device"}'
Invoke-RestMethod -Method Post http://localhost:4000/api/devices/heartbeat -Headers $h -ContentType application/json -Body '{"deviceId":"manual-test-device","rssi":-58}'
Invoke-RestMethod -Method Post http://localhost:4000/api/events/ingest -Headers $h -ContentType application/json -Body '{"deviceId":"manual-test-device","clientIp":"192.168.1.77","method":"GET","path":"/.env","responseStatus":404}'
```

These records are *manual device-endpoint tests*, not a physical device. Remove them afterwards so they cannot be mistaken for real hardware:

```powershell
mongosh iot_honeypot --eval 'db.devices.deleteOne({deviceId:"manual-test-device"}); db.events.deleteMany({deviceId:"manual-test-device"})'
```

(`mongosh` is installed separately from the MongoDB server. You can also delete the documents in MongoDB Compass.)

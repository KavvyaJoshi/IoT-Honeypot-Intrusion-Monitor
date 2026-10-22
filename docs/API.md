# API reference

Base URL: `http://<host>:4000/api`. All bodies are JSON (max **8 KB**).

**Response shapes**

- Success: `{ "data": ... }`. Lists add `pagination` (`/events`) or `meta` (`/devices`).
- Error: `{ "error": { "code": "BAD_REQUEST", "message": "Invalid request body", "details": [{ "path": "method", "message": "..." }] } }`

**Authentication**

| Kind | Header | Used by |
| --- | --- | --- |
| Device | `X-Device-Key: <DEVICE_API_KEY>` | `/devices/register`, `/devices/heartbeat`, `/events/ingest` |
| Admin | `Authorization: Bearer <ADMIN_TOKEN>` | `PATCH /rules/:id`, `PATCH /settings`, `/simulator/*` (except `GET /simulator/scenarios`), `/auth/verify` |
| None | - | Read-only GET endpoints (see *Security notes*) |

**Common error codes**

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST`, `MALFORMED_JSON`, `VALIDATION_FAILED` | Invalid input |
| 401 | `UNAUTHORIZED` | Missing/invalid device key or admin token |
| 403 | `FORBIDDEN` | Simulator disabled (`SIMULATOR_ENABLED=false`) |
| 404 | `NOT_FOUND`, `DEVICE_NOT_REGISTERED` | Unknown route/resource/device |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 8 KB |
| 429 | `RATE_LIMITED` | HTTP API limit exceeded (`retryAfterSeconds` included; `RateLimit` headers set) |
| 503 | `DATABASE_UNAVAILABLE`, `DEVICE_AUTH_NOT_CONFIGURED`, `ADMIN_AUTH_NOT_CONFIGURED` | MongoDB down or secret not configured |
| 500 | `INTERNAL_ERROR` | Unexpected; details only in server log |

Range parameters accept `range=15m|1h|24h|7d|all`. Chart endpoints also accept `tzOffset` (minutes east of UTC, e.g. `330` for IST), which aligns hour and day buckets to local time.

---

## Health

### `GET /health`
Always `200` while the API process is up.
```json
{ "data": { "status": "ok", "service": "iot-honeypot-backend", "version": "1.0.0", "environment": "development",
  "time": "2026-10-22T17:30:00.000Z", "uptimeSeconds": 512, "database": { "state": "connected", "connected": true },
  "realtime": { "connectedClients": 1 }, "simulatorEnabled": true } }
```
`status` is `degraded` when MongoDB is not connected.

### `GET /health/database`
`200` when connected, `503` otherwise. The connection string is never returned; credentials are masked in `lastError`.
```json
{ "data": { "state": "connected", "connected": true, "host": "127.0.0.1", "port": 27017, "name": "iot_honeypot", "lastError": null, "latencyMs": 1.9 } }
```

### `GET /auth/verify` (admin)
`200 { "data": { "valid": true } }` or `401`. The dashboard's unlock dialog uses it.

---

## Events

### `POST /events/ingest` (device)
The device report contract (fields, examples, retry policy) is documented in [firmware/README.md](../firmware/README.md#3-report-an-observation---post-apieventsingest).
Responds `201` for a new event or `200` for a duplicate `correlationId`, with a compact verdict:
```json
{ "data": { "eventId": "6717d4c2...", "severity": "medium", "classification": "suspicious", "category": "suspicious-path",
  "actionTaken": "logged", "recommendedAction": "log", "duplicate": false } }
```

### `GET /events`
Query parameters (all optional):

| Param | Values |
| --- | --- |
| `page`, `limit` | default 1 / 25, `limit` ≤ 100 |
| `search` | substring of path, source identifier or device id (regex-escaped, case-insensitive) |
| `severity` | comma list of `info,low,medium,high,critical` |
| `category` | comma list, e.g. `suspicious-path,malformed-request` |
| `classification` | comma list of `normal,suspicious,high-risk` |
| `actionTaken` | comma list of `allowed,logged,rate-limited,blocked` |
| `sourceType` | comma list of `device,simulator,backend` |
| `deviceId` | exact device id |
| `range` | default `all` |
| `sort` | `timestamp` (default), `severity`, `method`, `path`, `category`, `sourceIdentifier`, `sourceType`, `actionTaken`, `responseStatus` |
| `order` | `desc` (default) or `asc` |

```json
{
  "data": [{
    "id": "6717d4c2...", "timestamp": "2026-10-22T17:47:34.092Z", "receivedAt": "2026-10-22T17:47:34.095Z",
    "sourceType": "simulator", "simulated": true, "deviceId": "simulated-esp8266",
    "sourceIdentifier": "203.0.113.211", "clientIp": "203.0.113.211",
    "method": "POST", "path": "/login", "query": "user=admin&password=[REDACTED]", "responseStatus": 401,
    "userAgent": "python-requests/2.32 (simulated)", "loginResult": "failed",
    "category": "repeated-failed-login", "severity": "high", "severityRank": 3, "classification": "high-risk",
    "detections": [{ "ruleId": "failed-login", "ruleName": "Repeated failed test-login attempts", "category": "repeated-failed-login",
      "severity": "high", "reason": "5 failed login attempts against test endpoint /login from client 203.0.113.211 within 300s (threshold: 5). Consistent with password guessing; this does not identify who controls the source.",
      "evidence": { "count": 5, "threshold": 5, "windowSeconds": 300, "endpoint": "/login" }, "recommendedAction": "block" }],
    "detectionReasons": ["5 failed login attempts against ..."],
    "actionTaken": "blocked",
    "metadata": { "headers": { "content-type": "application/x-www-form-urlencoded", "authorization": "[REDACTED]", "cookie": "[REDACTED]" },
      "pathLength": 6, "bodyBytes": 48, "scenario": "failed-login" }
  }],
  "pagination": { "page": 1, "limit": 25, "total": 58, "totalPages": 3 }
}
```

### `GET /events/:id`
`200 { "data": <event> }`, `404` if not found, `400` if the id is not a valid ObjectId.

### `GET /events/stats?range=1h&sourceType=device&tzOffset=330`
```json
{ "data": {
  "range": "1h", "sourceType": null, "from": "...", "to": "...", "bucketMs": 120000,
  "totals": { "total": 51, "suspicious": 15, "highSeverity": 2, "critical": 0, "rateLimited": 6, "blocked": 2,
              "simulated": 51, "device": 0, "activeEnforcements": 2 },
  "bySeverity": [{ "severity": "info", "count": 36 }, ...],
  "byCategory": [{ "category": "excessive-requests", "count": 6 }, ...],
  "byAction": [...], "bySourceType": [...],
  "topPaths": [{ "path": "/api/sensor", "count": 26, "suspicious": 6 }, ...],
  "topRules": [{ "ruleId": "request-rate", "ruleName": "Excessive request rate", "category": "excessive-requests", "count": 6 }, ...],
  "timeline": [{ "t": "2026-10-22T17:46:00.000Z", "total": 51, "suspicious": 15, "highSeverity": 2 }, ...]
} }
```
`timeline` is zero-filled for every bucket in the range.

---

## Devices

| Endpoint | Auth | Description |
| --- | --- | --- |
| `POST /devices/register` | device | Create/update a device (see firmware guide) |
| `POST /devices/heartbeat` | device | Update `lastHeartbeatAt`, RSSI, uptime, heap |
| `GET /devices` | - | All devices with computed `status` and `eventCount` |
| `GET /devices/:id` | - | One device plus its 10 most recent events |
| `GET /devices/setup` | - | Integration info: `baseUrls`, `interfaces` (`name`, `address`, `cidr`, `likelyVirtual`, `url`; re-detected every 10 s), `listening` (`host`, `port`, `lanAccessible`), endpoints, auth header name, whether a key is configured (never the key) |
| `GET /devices/activity?range=24h` | - | Events over time per device plus one `simulator` series |

Device object:
```json
{ "id": "...", "deviceId": "esp8266-lab-01", "name": "Lab honeypot", "hardware": "ESP8266", "firmwareVersion": "1.0.0",
  "ipAddress": "192.168.1.40", "registeredAt": "...", "lastHeartbeatAt": "...", "lastSeenAt": "...",
  "lastRssi": -61, "lastUptimeMs": 120000, "lastFreeHeap": 31000, "heartbeatCount": 14,
  "status": "online", "heartbeatTimeoutSeconds": 90, "eventCount": 37 }
```
`status` is `online` when the last heartbeat is within the timeout, `offline` when it is older, and `never-connected` when the device registered but has sent no heartbeat. `network` is `{ sameSubnet, laptopInterface }`: whether the device's last reported IP is inside one of the laptop's current subnets. Sharing a subnet is necessary, but client isolation or a firewall can still block traffic.

---

## Detection rules

### `GET /rules`
```json
{ "data": [{ "id": "request-rate", "name": "Excessive request rate", "description": "...", "category": "excessive-requests",
  "enabled": true, "severity": "medium", "action": "rate-limit", "params": { "threshold": 20, "windowSeconds": 60 },
  "defaults": { "severity": "medium", "action": "rate-limit", "params": { "threshold": 20, "windowSeconds": 60 } },
  "paramFields": [{ "key": "threshold", "label": "Requests per source", "type": "integer", "min": 3, "max": 1000 }, ...],
  "updatedAt": null }] }
```

### `PATCH /rules/:id` (admin)
Partial update; every field is optional, but at least one is required.
```json
{ "enabled": true, "severity": "high", "action": "block", "params": { "threshold": 10 } }
```
Params are merged with the current values and validated against the rule's bounds. Unknown params or fields return `400`. The change applies to the next event and is broadcast as `rules:updated`.

| Rule id | Params (bounds) | Default severity / action |
| --- | --- | --- |
| `request-rate` | `threshold` 3-1000 (20), `windowSeconds` 5-3600 (60) | medium / rate-limit |
| `failed-login` | `threshold` 2-100 (5), `windowSeconds` 10-86400 (300) | high / block |
| `suspicious-path` | `patterns` ≤50 strings ≤64 chars (plain substring, no regex) | medium / log |
| `malformed-request` | `maxPathLength` 32-2048 (256), `maxQueryLength` 32-2048 (512), `allowedMethods` | medium / log |
| `not-found-repeat` | `threshold` 2-1000 (10), `windowSeconds` 10-3600 (120) | medium / log |
| `traffic-anomaly` | `baselinePerMinute` 1-10000 (60), `multiplier` 2-50 (3) | low / log |

### `GET /detection/stats?range=24h`
Returns per-rule match counts with `lastMatchedAt`, an `actionTimeline` (`logged`, `rateLimited`, `blocked`, `apiRateLimited` per bucket) and `activeEnforcements` (source, action, triggering rule, since, until).

---

## Simulator

| Endpoint | Auth | Body |
| --- | --- | --- |
| `GET /simulator/scenarios` | - | Lists scenarios and the related rules' enabled state |
| `POST /simulator/events` | admin | `{ "scenario": "normal" \| "repeated-requests" \| "failed-login" \| "suspicious-path" \| "malformed" \| "rate-limit-threshold", "sourceIp"?: "<RFC 5737 address>" }` |
| `POST /simulator/reset` | admin | `{ "confirm": "DELETE_SIMULATOR_DATA" }` deletes only `simulated: true` events |
| `POST /simulator/rate-limit-probe` | admin | No body. Limited to `RATE_LIMIT_PROBE_MAX` per `RATE_LIMIT_PROBE_WINDOW_MS` for the 429 demo |

All `/simulator/*` routes return `403` when `SIMULATOR_ENABLED=false`. Scenario results (`201`):
```json
{ "data": { "scenario": "failed-login", "label": "Simulated failed test-login attempts", "sourceIp": "192.0.2.210",
  "generated": 6, "flagged": 2, "bySeverity": { "info": 4, "high": 2 }, "byAction": { "allowed": 4, "blocked": 2 },
  "disabledRules": [], "events": [{ "id": "...", "method": "POST", "path": "/login", "severity": "high",
  "category": "repeated-failed-login", "actionTaken": "blocked" }] } }
```

---

## Settings

### `GET /settings`
```json
{ "data": {
  "runtime": { "heartbeatTimeoutSeconds": 90, "recommendedHeartbeatIntervalSeconds": 30, "retentionDays": 30,
               "enforcementDurationSeconds": 300, "testLoginPaths": ["/login"] },
  "environment": { "nodeEnv": "development", "port": 4000, "simulatorEnabled": true, "corsOrigins": ["http://localhost:5173"],
                   "trustProxy": false, "adminTokenConfigured": true, "deviceApiKeyConfigured": true,
                   "databaseConnected": true, "maxRequestBodyBytes": 8192,
                   "rateLimits": { "windowMs": 60000, "publicMax": 600, "deviceMax": 240, "simulatorMax": 60, "probeWindowMs": 10000, "probeMax": 5 } } } }
```
Secrets appear only as `...Configured: true/false`.

### `PATCH /settings` (admin)
Partial `runtime` update with bounds: `heartbeatTimeoutSeconds` 15-3600, `recommendedHeartbeatIntervalSeconds` 5-1800 (must be below the timeout), `retentionDays` 0-365 (0 means keep forever), `enforcementDurationSeconds` 10-86400, `testLoginPaths` 1-10 paths starting with `/`.

---

## Socket.IO events (server → dashboard only)

Connect to the API origin with path `/socket.io`. The server ignores client messages.

| Event | Payload | Sent when |
| --- | --- | --- |
| `event:new` | Full persisted event | After MongoDB acknowledged the insert |
| `device:update` | Device object with `status` | Register, heartbeat, or a device crossing the heartbeat timeout |
| `rules:updated` | Updated rule | `PATCH /rules/:id` |
| `settings:updated` | Runtime settings | `PATCH /settings` |
| `simulator:reset` | `{ deletedCount }` | Simulator reset |
| `system:database` | Database status | On connect and on every MongoDB connect/disconnect |

## Rate limits (HTTP 429)

Limits are per client IP and in-memory. They are configured in `backend/.env`.

| Limiter | Applies to | Default |
| --- | --- | --- |
| `public` | All GET endpoints, admin PATCHes | 600 / 60 s |
| `device` | register, heartbeat, ingest | 240 / 60 s |
| `simulator` | `/simulator/events`, `/simulator/reset` | 60 / 60 s |
| `rate-limit-probe` | `/simulator/rate-limit-probe` | 5 / 10 s |

The first 429 per limiter and client in each window is stored as one `api-rate-limit` event (`sourceType: "backend"`). Further 429s in that window are not stored. These events bypass the detection engine, so they cannot trigger a feedback loop.

## Security notes

Read endpoints are unauthenticated so the dashboard works without login on a lab LAN. Before exposing the API beyond a trusted network, put it behind authentication (e.g. a reverse proxy with SSO or a session layer) and HTTPS. See [ARCHITECTURE.md](ARCHITECTURE.md#security-controls) for the full list of development-only settings.

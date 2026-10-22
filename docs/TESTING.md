# Testing

## Automated tests

| Suite | Command | Needs | What it covers |
| --- | --- | --- | --- |
| Backend unit + API | `cd backend; npm test` | Local MongoDB (uses the `iot_honeypot_test` database and drops it each run) | Health endpoints, CORS/headers, validation, persistence, every detection rule, normal traffic not flagged, escalation, enforcement expiry, redaction, rate limiting and single 429 event, device registration/heartbeat/online/offline/timeout setting, simulator scenarios and access control, reset deletes only simulated data, rules/settings validation, secrets never returned, Socket.IO delivery after persistence, behaviour when MongoDB is down |
| Frontend | `cd frontend; npm test` | Nothing (API and socket mocked) | Loading, empty and error states (dashboard, events, devices, simulator), live-data rendering, simulated/suspicious/blocked row styling, event details explanations, redacted headers, system banners, formatters |
| End-to-end smoke | `cd backend; npm run smoke` | Backend running (`npm run dev`) with MongoDB and `ADMIN_TOKEN` | Real HTTP against the running server: auth rejections, all six scenarios classified as expected, redaction in stored data, HTTP 429 demo, stats |

Override the test database with `MONGODB_URI_TEST`, e.g. `$env:MONGODB_URI_TEST="mongodb://127.0.0.1:27017/my_test_db"`.

## Example test cases

### Normal activity (must not be flagged)

| Input | Expected |
| --- | --- |
| `GET /` → 200 | `info`, `normal`, `allowed`, no detections |
| `GET /api/sensor` 19 times in 60 s from one IP | all `allowed` (threshold is 20) |
| `POST /login` → 200, `loginResult: success` | `allowed` |
| One `POST /login` → 401 failed | `allowed` (one failure is not a pattern) |
| One `GET /missing.html` → 404 | `allowed` |
| `GET /search?q=hello%20world` | `allowed` |

### Suspicious activity

| Input | Expected rule | Expected verdict |
| --- | --- | --- |
| 20+ requests from one IP within 60 s | `request-rate` | `medium`, `rate-limited`; later requests from the source stay rate-limited for 300 s |
| 5 failed `POST /login` within 300 s | `failed-login` | `high`, `high-risk`, `blocked` |
| `GET /.env`, `/wp-login.php`, `/cgi-bin/luci` | `suspicious-path` | `medium`, `logged`, reason says "not a confirmed attack" |
| `GET /static/..%2f..%2fetc`, `GET /a%00.jpg`, `PROPFIND /`, 300-char path, `/x/%E0%A4%A` | `malformed-request` | `medium`, `logged`, reason lists each issue |
| 10 × 404 within 120 s | `not-found-repeat` | `medium`, `route-enumeration` |
| `GET /admin/../../etc/passwd` | `suspicious-path` + `malformed-request` | escalated to `high` with an escalation reason |
| Body with `Authorization`, `Cookie`, `?password=` | - | stored as `[REDACTED]`; password never stored |
| 9 rapid calls to `/api/simulator/rate-limit-probe` | API limiter | 5 × 200, then 429; exactly one `api-rate-limit` event |

## Manual testing

### With the dashboard

1. Start MongoDB, the backend and the frontend ([setup guide](SETUP_AND_TROUBLESHOOTING.md)).
2. Check the top bar: **API Up · DB Connected · Stream Live**.
3. **Unlock admin** with `ADMIN_TOKEN`.
4. Open **Controlled testing** and run each scenario. Open **Security events** in a second tab: rows appear live with a brief highlight, without reloading.
5. Expand a blocked `/login` row, then **Open full event record**. The Authorization and Cookie headers show `[REDACTED]`, and the query shows `password=[REDACTED]`.
6. **Detection rules**: lower `request-rate` → threshold to 5, then run *Rate-limit threshold demonstration*. More events are rate-limited, and the active decision appears under *Active enforcement decisions*.
7. **Controlled testing → API rate limiter demonstration**: 5 × 200, then 429s.
8. Stop MongoDB (`Stop-Service MongoDB`, admin PowerShell). The amber banner appears and running a scenario shows a 503 error. Start it again; the banner clears within seconds.
9. **Reset demo data**: confirm, and simulated events disappear while device events stay.

### With PowerShell (raw API)

```powershell
$admin = @{ Authorization = "Bearer <ADMIN_TOKEN>" }
Invoke-RestMethod http://localhost:4000/api/health
Invoke-RestMethod -Method Post http://localhost:4000/api/simulator/events -Headers $admin -ContentType application/json -Body '{"scenario":"failed-login"}'
Invoke-RestMethod "http://localhost:4000/api/events?severity=high,critical&limit=5"
Invoke-RestMethod "http://localhost:4000/api/events/stats?range=15m"
# Validation error example (400 with details):
try { Invoke-RestMethod -Method Post http://localhost:4000/api/simulator/events -Headers $admin -ContentType application/json -Body '{"scenario":"port-scan"}' } catch { $_.ErrorDetails.Message }
```

The device endpoints can be exercised without hardware using the commands in [firmware/README.md](../firmware/README.md#testing-the-contract-without-a-board). Those create a clearly named `manual-test-device`; remove it afterwards.

## Demonstration checklist for the evaluator

Preparation (before the session)
- [ ] MongoDB service running; `backend/.env` has `DEVICE_API_KEY` and `ADMIN_TOKEN`.
- [ ] `cd backend; npm test` and `cd frontend; npm test` pass (show the output).
- [ ] Backend and frontend running; dashboard open; admin unlocked.
- [ ] Optional: the ESP8266 is flashed, on the same Wi-Fi, and shows **Online** on Devices. On the demo network: `npm run network-check`, update the board with the serial `url` command if the IP changed, run serial `test`, and do the phone-browser check of `/api/health` ([NETWORKING.md](NETWORKING.md#before-and-after-the-demo)).
- [ ] Firewall: only the scoped `IoT Honeypot` rule (remove it after the demo).
- [ ] Start from a clean slate: **Reset demo data**.

During the demo
1. [ ] **Architecture**: show the Mermaid diagram in docs/ARCHITECTURE.md. ESP8266/simulator → validation → normalization/redaction → detection → MongoDB → Socket.IO → dashboard.
2. [ ] **Health**: top bar chips and the Settings page (API, MongoDB ping, Socket.IO transport, ESP8266 last seen).
3. [ ] **Real device** (if available): open `http://<esp-ip>/` and `/login` from a phone. Events appear live with the **ESP8266** badge, and the device card shows its RSSI as "reported by device".
4. [ ] **Normal traffic**: run *Normal request*. It is `Info / Allowed`, with "No detection rule matched".
5. [ ] **Suspicious path**: `Medium / Logged`. Point out the reason says "signal, not a confirmed attack".
6. [ ] **Failed logins**: the 5th attempt is `High / Blocked`. Open the event: rule, evidence (count, threshold, window), and redacted Authorization, Cookie and password.
7. [ ] **Rate-limit threshold**: requests 20-25 are `Rate-limited`. Show the active decision on Detection rules, then turn on *Reuse last source* and run *Normal request*: it is still rate-limited (active enforcement).
8. [ ] **API 429 demo**: 5 accepted, then 429s. Explain API abuse protection vs. detection vs. application-layer blocking (Rules page card).
9. [ ] **Explainable, configurable rules**: change a threshold, save, re-run, and show the different outcome.
10. [ ] **Simulated vs. real**: filter Security events by Source = Simulator / ESP8266. Simulated rows carry the violet badge and TEST-NET IPs.
11. [ ] **Analytics**: time ranges, each chart's Table view, the activity-by-source chart.
12. [ ] **Resilience**: stop MongoDB. The banner appears, writes return 503 and nothing is "fake stored". Restart it and the system recovers.
13. [ ] **Security**: wrong admin token rejected; settings never show secrets; `.env` not in the repo.
14. [ ] **Reset demo data**: only simulated events are deleted.

Points to state honestly
- Detection rules are threshold heuristics over what the firmware reports. They are not complete intrusion detection and do not identify attackers.
- Blocking is advisory and application-layer (the firmware answers 403/429). There is no network firewall.
- Counters and decisions are in memory (reset on restart); multi-instance deployments need Redis.
- The reference firmware sketch compiles (ESP8266 core 3.1.2) but was not flashed or run on a board in this repository's checks.
- If the ESP8266 cannot reach the laptop on college Wi-Fi (client isolation is common), switch both to your phone hotspot, or demonstrate with the simulator and say so.

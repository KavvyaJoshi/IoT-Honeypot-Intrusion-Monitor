# Setup and troubleshooting

## Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | 20.19+ or 22.12+ (tested on 22.16) | `node --version` |
| npm | 10+ | `npm --version` |
| MongoDB Community Server | 6+ (tested on 8.0), local | `Get-Service MongoDB` (Windows) |
| Arduino IDE + ESP8266 core 3.x | only for the physical device | - |

## 1. Install

```powershell
cd backend
npm install
cd ..\frontend
npm install
```

Both folders contain an `.npmrc` with `legacy-peer-deps=true` to avoid an npm 10.9 crash; see [ARCHITECTURE.md](ARCHITECTURE.md#dependency-decisions).

## 2. Configure the backend

```powershell
cd backend
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # run twice
```

Paste one generated value into `DEVICE_API_KEY=` and the other into `ADMIN_TOKEN=` in `backend/.env`. Leave the other values at their defaults for a local demo.

The frontend needs no configuration. In development it proxies `/api` and `/socket.io` to `http://localhost:4000`. See `frontend/.env.example` to change that.

## 3. Run

Terminal 1:
```powershell
cd backend
npm run dev        # node --watch; use "npm start" without auto-reload
```
Expected: `API listening on http://0.0.0.0:4000`, then `MongoDB connected` and `Loaded settings and detection rules from MongoDB`.

Terminal 2:
```powershell
cd frontend
npm run dev
```
Open http://localhost:5173. Click **Unlock admin** (top right) and paste `ADMIN_TOKEN` to enable the simulator and editing.

To open the dashboard from another device on the LAN, run `npm run dev -- --host` and add that origin (e.g. `http://192.168.1.20:5173`) to `CORS_ORIGINS`.

### Production-style build

```powershell
cd frontend
npm run build      # outputs frontend/dist
npm run preview    # serves dist on http://localhost:4173 with the same proxy
```

If you serve `dist` from another server, set `VITE_API_BASE_URL` before building and add that origin to `CORS_ORIGINS`.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Red banner "Backend API unreachable" | Backend not running, crashed, or on another port. Check terminal 1. The `vite` proxy target is `VITE_BACKEND_PROXY_TARGET`. |
| Amber banner "MongoDB is not connected"; ingestion/simulator return 503 | Start MongoDB: `Start-Service MongoDB` (admin PowerShell) or run `mongod`. Check `MONGODB_URI`. The backend retries every `MONGODB_CONNECT_RETRY_MS` and recovers on its own. |
| Backend exits with `Invalid environment configuration` | A value in `.env` failed validation; the message names it. For example, `DEVICE_API_KEY` and `ADMIN_TOKEN` need at least 16 characters. |
| `Port 4000 is already in use` | Another backend is still running: `Get-NetTCPConnection -LocalPort 4000 \| Select OwningProcess`, then stop it, or change `PORT` (and `VITE_BACKEND_PROXY_TARGET`). |
| Warnings that `DEVICE_API_KEY`/`ADMIN_TOKEN` are not set | Device endpoints / admin actions return 503 until you set them and restart. |
| "That admin token is not valid" | Token in the dialog does not match `ADMIN_TOKEN`; restart the backend after editing `.env`. |
| Stream chip says "Offline" | Socket.IO cannot connect. Is the backend up? If calling the API directly via `VITE_API_BASE_URL`, the dashboard origin must be in `CORS_ORIGINS`. |
| Browser console shows CORS errors | Add the exact dashboard origin (scheme, host and port) to `CORS_ORIGINS` and restart the backend. |
| ESP8266 `[register] HTTP -1` (or negative codes) | It cannot reach the laptop. Type `test` in the Serial Monitor and follow [docs/NETWORKING.md](NETWORKING.md#connectivity-troubleshooting-checklist): changed IP (`url http://<ip>:4000`), different subnet, scoped firewall rule, client isolation. |
| ESP8266 `[register] HTTP 401` | `DEVICE_API_KEY` in `secrets.h` differs from `backend/.env`. |
| ESP8266 `[ingest] HTTP 404` | Not registered (for example the database was reset). The sketch re-registers automatically. |
| Device stays "Offline" | No heartbeat within `heartbeatTimeoutSeconds`. Check the serial monitor and the heartbeat interval. |
| 429 on the dashboard | You exceeded `RATE_LIMIT_PUBLIC_MAX` (very fast refreshing). Wait for the window or raise the limit. |
| `npm install` fails with `edgesOut` | Make sure the `.npmrc` files exist, or run `npm install --legacy-peer-deps`. |
| Backend API tests fail with "API tests need a running MongoDB" | Start MongoDB, or set `MONGODB_URI_TEST`. Tests use the `iot_honeypot_test` database, which is dropped on each run. |
| Charts show buckets at odd times | Buckets align to the browser's timezone via `tzOffset`; the 7-day view uses 6-hour buckets. |

## Resetting data

- Simulated data only: **Practice lab → Lab tools → Delete simulated events** (or `POST /api/simulator/reset`).
- Everything (development only): `mongosh iot_honeypot --eval "db.dropDatabase()"`, or delete the `iot_honeypot` database in MongoDB Compass. Defaults are re-seeded on the next backend start.

`mongosh` is a separate download since MongoDB 6 (https://www.mongodb.com/try/download/shell). MongoDB Compass works just as well for inspecting the `events`, `devices`, `rules` and `settings` collections.

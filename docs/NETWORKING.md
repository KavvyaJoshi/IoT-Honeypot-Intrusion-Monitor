# Networking: phone hotspot, college Wi-Fi and changing IP addresses

The same build works on a phone hotspot during development and on college Wi-Fi during the demo. No IP address is hard-coded in source code:

| Piece | Where the address comes from | How to change it |
| --- | --- | --- |
| Backend listen address | `HOST` / `PORT` in `backend/.env` | Edit `.env`, restart the backend |
| Laptop LAN IP shown to you | Detected from the network adapters every 10 s | Automatic (Devices page, startup log, `npm run network-check`) |
| ESP8266 → backend URL | `WIFI_n_BACKEND_URL` per Wi-Fi network in `secrets.h` | Serial Monitor: `url http://<ip>:4000` (saved on the board, no reflash) |
| Dashboard → backend | Vite proxy to `VITE_BACKEND_PROXY_TARGET` (default `http://localhost:4000`), or `VITE_API_BASE_URL` | `frontend/.env.local`, restart `npm run dev` |
| Allowed browser origins (CORS) | `CORS_ORIGINS` + (development) this laptop's own LAN IPs on ports 5173/4173 | `backend/.env` |

The dashboard runs on the same laptop as the backend and reaches it through `localhost`, so it keeps working when the Wi-Fi IP changes. Only the ESP8266 needs the laptop's LAN IP.

## Two operating modes

| Mode | `HOST` | Use when | Exposure |
| --- | --- | --- | --- |
| **Laptop-only** | `127.0.0.1` | Simulator demos, no ESP8266, or an untrusted network | API reachable only from this laptop |
| **LAN device mode** | `0.0.0.0` (default) | The ESP8266 must report to the backend | API listens on every adapter; Windows Firewall is the boundary, so allow only what is needed (below) |

The simulator works in both modes and does not depend on the ESP8266 or on Wi-Fi. If the device cannot connect during the demo, switch to the **Controlled testing** page. Simulated events are always labelled **Simulated** and never shown as ESP8266 traffic.

Security implications of `HOST=0.0.0.0`: anyone on the same network who can get through the firewall can call the read-only API endpoints and open the dashboard's live stream data. Write endpoints still need the device key or admin token. Keep the firewall exception narrow, prefer your own hotspot, and switch back to `HOST=127.0.0.1` when you are not testing the device. Never port-forward, use public tunnels (ngrok and similar), or disable the firewall.

The Vite dev server listens on `localhost` only by default. Do not start it with `--host` on college Wi-Fi unless you need the dashboard on another device. If you do, the backend already allows the laptop's own LAN origin in development.

## Find the laptop's IPv4 address (Windows)

```powershell
ipconfig
```

Look under the adapter that is connected to the network the ESP8266 uses:

```
Wireless LAN adapter Wi-Fi:
   IPv4 Address. . . . . . . . . . . : 192.168.43.10      <- use this
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.43.1
```

- Phone hotspot over Wi-Fi: `Wireless LAN adapter Wi-Fi`. Typical ranges are Android `192.168.43.x` / `10.x.x.x` / `192.168.x.x` and iPhone `172.20.10.x`.
- Phone hotspot over USB tethering: shows as `Ethernet N` (iPhone/Android USB). The ESP8266 on the phone's Wi-Fi hotspot is on the same subnet, so this works too.
- Ignore `vEthernet (WSL/Hyper-V)`, `VirtualBox`, `VMware`, VPN and Bluetooth adapters.

Shortcut: `cd backend; npm run network-check` lists the candidate addresses, subnets, the firewall rules and the Windows network profile. The backend also prints `ESP8266 backend URL candidate: ...` on startup, and the Devices page shows the same list.

## Pointing the ESP8266 at the laptop

1. Put the hotspot and the college network in `secrets.h` (`WIFI_1_*`, `WIFI_2_*`) with the best-known backend URL for each. The board joins whichever configured network is strongest. ESP8266 supports **2.4 GHz only**.
2. When the laptop's IP changes, open the Arduino Serial Monitor (115200 baud, "Newline") and type:
   ```
   url http://192.168.43.10:4000
   ```
   The board saves it for the current Wi-Fi network, re-registers and runs a connectivity test. `url reset` returns to the `secrets.h` value.
3. `status` shows the board's IP, subnet mask, gateway, RSSI, the backend URL and its source. `test` calls `GET /api/health` and prints specific hints.

## Windows Firewall: narrow exceptions only

Windows treats most new networks, including hotspots, as **Public**, and blocks inbound connections. Never turn the firewall off. Add one rule that allows only TCP 4000, only for `node.exe`, and only from the local subnet or the ESP8266's IP. The helper script does exactly that. Run it in an **Administrator** PowerShell:

```powershell
cd backend
# Show rules and the current network profile (no admin needed)
powershell -ExecutionPolicy Bypass -File scripts\firewall-rule.ps1

# Own phone hotspot, if you set that network to Private: allow the local subnet
powershell -ExecutionPolicy Bypass -File scripts\firewall-rule.ps1 -Action Add

# Hotspot left as Public, or college Wi-Fi: allow ONLY the ESP8266's IP
powershell -ExecutionPolicy Bypass -File scripts\firewall-rule.ps1 -Action Add -RemoteAddress 10.20.5.42 -NetworkProfile Public

# After the demo
powershell -ExecutionPolicy Bypass -File scripts\firewall-rule.ps1 -Action Remove
```

The script refuses `Any`/`0.0.0.0/0`. Only mark a network **Private** (Settings → Network & Internet → Wi-Fi → network properties) if you trust it, i.e. your own hotspot, never shared college Wi-Fi.

When Node.js first listens, Windows may show an "Allow access" prompt. Do not tick **Public networks**. Cancel it and use the scoped rule instead. If you allowed it earlier, the script's *Show* output warns about broad `Node.js JavaScript Runtime` rules. Review and disable them in *Windows Defender Firewall with Advanced Security → Inbound Rules*.

## Same Wi-Fi does not guarantee connectivity

Two devices on one network name can still be unable to talk to each other:

- **Client (AP) isolation**: common on college/enterprise and guest Wi-Fi, and an option on some phone hotspots. The network forwards traffic to the internet but drops device-to-device traffic.
- **Different subnets / VLANs**: large networks put clients in different subnets or VLANs, even under one SSID.
- **Captive portals**: a device without a browser (the ESP8266) cannot complete the login page.
- **802.1X / WPA2-Enterprise** (eduroam and similar): the ESP8266 sketch supports WPA2-Personal only.
- **5 GHz-only networks**: invisible to the ESP8266.

Test from a third device instead of assuming. Open `http://<laptop-ip>:4000/api/health` in a phone browser on the same network. If the phone cannot load it, neither can the ESP8266.

## Connectivity troubleshooting checklist

Work top to bottom. Most problems are in the first five steps.

| # | Check | How | Fix |
| --- | --- | --- | --- |
| 1 | Backend running in LAN mode | Terminal shows `API listening on http://0.0.0.0:4000`; `npm run network-check` → *LAN mode* | Set `HOST=0.0.0.0`, restart |
| 2 | Laptop IP is current | `ipconfig` now vs. the URL on the ESP8266 (`status`) | `url http://<new-ip>:4000` in Serial Monitor |
| 3 | ESP8266 joined the right Wi-Fi | Serial: `[wifi] <ssid> ip=...` | Check SSID/password in `secrets.h`; network must be 2.4 GHz, WPA2-Personal, no captive portal |
| 4 | Same subnet | Board IP/mask (`status`) vs. laptop CIDR (`network-check`); the Devices card says "Same subnet" | Join both to the same network; on segmented college Wi-Fi use the phone hotspot |
| 5 | Firewall allows TCP 4000 | `scripts\firewall-rule.ps1` shows a rule for the current profile | Add the scoped rule (above) |
| 6 | No client isolation | Phone on the same network opens `http://<laptop-ip>:4000/api/health` | If it fails, isolation is likely: use your own hotspot with isolation off |
| 7 | Auth correct | Serial shows HTTP 401 | Copy `DEVICE_API_KEY` exactly from `backend/.env` into `secrets.h` |
| 8 | Device registered | HTTP 404 `DEVICE_NOT_REGISTERED` | The sketch re-registers automatically; check step 7 |
| 9 | Heartbeats arriving | Top bar **ESP8266** chip / Devices page **Online** | Status turns Offline after `heartbeatTimeoutSeconds` (90 s) without heartbeats |
| 10 | VPN / proxy on laptop | VPN adapters in `ipconfig` | Disconnect the VPN; it can capture LAN routes |

Fallback for the demo: if the college network blocks device-to-device traffic, connect both the laptop and the ESP8266 to your phone hotspot. The `secrets.h` profile and the serial `url` command make this a one-minute switch. If even that fails, demonstrate with the simulator, stating clearly that the events are simulated.

## Before and after the demo

Before
- [ ] `npm run network-check`: correct IP, LAN mode, rule present for the active profile.
- [ ] ESP8266 Serial `test` → `HTTP 200`; dashboard chip **ESP8266 1/1 online**.
- [ ] Phone browser test of `/api/health` passes (rules out isolation).

After
- [ ] `scripts\firewall-rule.ps1 -Action Remove`.
- [ ] Optional: `HOST=127.0.0.1` in `backend/.env` for simulator-only use.

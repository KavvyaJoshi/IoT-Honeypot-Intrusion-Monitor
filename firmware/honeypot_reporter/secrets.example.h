// Copy this file to secrets.h (same folder) and fill in your values.
// secrets.h is git-ignored. Never commit real Wi-Fi passwords or device keys.
#pragma once

// Up to three Wi-Fi networks. The board joins the strongest one it can see.
// BACKEND_URL = the laptop's IPv4 on THAT network (run `ipconfig` on the laptop), port 4000.
// Never "localhost": that would point at the ESP8266 itself.
// If the laptop's IP changes later, you do not need to reflash: type
//   url http://<new-laptop-ip>:4000
// in the Serial Monitor (115200 baud). The override is saved per network.

// Network 1, e.g. your phone hotspot (development)
#define WIFI_1_SSID "my-phone-hotspot"
#define WIFI_1_PASSWORD "hotspot-password"
#define WIFI_1_BACKEND_URL "http://172.20.10.3:4000"

// Network 2, e.g. college Wi-Fi (demo). Leave the SSID empty ("") if unused.
#define WIFI_2_SSID ""
#define WIFI_2_PASSWORD ""
#define WIFI_2_BACKEND_URL ""

// Network 3 (optional)
#define WIFI_3_SSID ""
#define WIFI_3_PASSWORD ""
#define WIFI_3_BACKEND_URL ""

// Must equal DEVICE_API_KEY in backend/.env.
#define DEVICE_API_KEY "paste-the-device-api-key-here"

// 3-64 characters: letters, digits, "-" or "_". Unique per board.
#define DEVICE_ID "esp8266-lab-01"
#define DEVICE_NAME "Lab honeypot"

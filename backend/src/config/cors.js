import { isOwnLanOrigin } from '../utils/network.js';

/**
 * Single origin check shared by Express CORS and Socket.IO. Allowed:
 * - requests without an Origin header (ESP8266, curl; CORS does not apply to them),
 * - origins listed in CORS_ORIGINS,
 * - when CORS_ALLOW_LAN_ORIGINS is on: this laptop's own current LAN IPs on LAN_FRONTEND_PORTS.
 */
export function createOriginCheck(config) {
  return function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (config.corsOrigins.includes(origin)) return true;
    return config.corsAllowLanOrigins && isOwnLanOrigin(origin, config.lanFrontendPorts);
  };
}

/** Adapter for the `cors` package / Socket.IO `origin` option. */
export function corsOriginOption(config) {
  const isAllowedOrigin = createOriginCheck(config);
  return (origin, callback) => callback(null, isAllowedOrigin(origin));
}

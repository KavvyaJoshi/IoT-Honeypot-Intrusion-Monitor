import os from 'node:os';

// Adapter names that usually belong to virtual or non-Wi-Fi networks the ESP8266 cannot reach.
const VIRTUAL_ADAPTER = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|loopback|bluetooth|tailscale|zerotier|vpn|tap|tun/i;
const CACHE_MS = 10_000;

let cache = { at: -Infinity, interfaces: [] };

/**
 * Non-internal IPv4 interfaces of this machine. Re-read every 10 s, so a new IP after
 * switching between a phone hotspot and college Wi-Fi is picked up without a restart.
 */
export function lanInterfaces(now = Date.now()) {
  if (now - cache.at < CACHE_MS) return cache.interfaces;
  const interfaces = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      interfaces.push({
        name,
        address: entry.address,
        cidr: entry.cidr ?? null,
        likelyVirtual: VIRTUAL_ADAPTER.test(name),
      });
    }
  }
  // Physical adapters (Wi-Fi/Ethernet) first: those are the ones the ESP8266 can use.
  interfaces.sort((a, b) => Number(a.likelyVirtual) - Number(b.likelyVirtual));
  cache = { at: now, interfaces };
  return interfaces;
}

export function clearNetworkCache() {
  cache = { at: -Infinity, interfaces: [] };
}

function ipv4ToInt(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** True if `ip` is inside `cidr` (e.g. "192.168.43.10" in "192.168.43.0/24"). IPv4 only. */
export function inSubnet(ip, cidr) {
  if (!cidr) return false;
  const [base, bitsText] = cidr.split('/');
  const bits = Number(bitsText);
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** The laptop interface sharing a subnet with `ip`, or null (different network or unknown). */
export function interfaceForPeer(ip) {
  if (!ip || ipv4ToInt(ip) === null) return null;
  return lanInterfaces().find((iface) => inSubnet(ip, iface.cidr)) ?? null;
}

/**
 * True if `origin` is this laptop's own LAN address on an allowed frontend port, e.g.
 * "http://192.168.43.10:5173". Arbitrary origins are never accepted by this check.
 */
export function isOwnLanOrigin(origin, ports) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (!ports.includes(port)) return false;
  return lanInterfaces().some((iface) => iface.address === url.hostname);
}

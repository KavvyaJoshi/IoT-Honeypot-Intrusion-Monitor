#!/usr/bin/env node
/**
 * Read-only connectivity diagnostics for the ESP8266 <-> laptop link.
 *   npm run network-check
 * Prints the laptop's IPv4 addresses and subnets, the backend URL to put in the firmware,
 * whether the API is listening, and (on Windows) the network profile and firewall rules.
 * It changes nothing.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../src/config/env.js';
import { lanInterfaces } from '../src/utils/network.js';

const run = promisify(execFile);
const config = loadConfig();

function section(title) {
  console.log(`\n== ${title} ==`);
}

async function powershell(command) {
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 20000 });
    return stdout.trim();
  } catch (error) {
    return `(could not query: ${error.message.split('\n')[0]})`;
  }
}

section('Backend configuration');
console.log(`HOST=${config.host}  PORT=${config.port}`);
const loopbackOnly = ['127.0.0.1', 'localhost', '::1'].includes(config.host);
console.log(
  loopbackOnly
    ? 'Laptop-only mode: the ESP8266 cannot connect. Use HOST=0.0.0.0 for device testing.'
    : 'LAN mode: devices on the same network can connect if the firewall and Wi-Fi allow it.',
);

section('Laptop IPv4 addresses (use the Wi-Fi one that matches the ESP8266 network)');
const interfaces = lanInterfaces();
if (!interfaces.length) console.log('None. Connect to the hotspot or Wi-Fi first.');
for (const iface of interfaces) {
  console.log(
    `${iface.likelyVirtual ? '  (virtual) ' : '  '}${iface.name.padEnd(28)} ${iface.address.padEnd(16)} ${iface.cidr ?? ''}` +
      (iface.likelyVirtual ? '' : `   -> BACKEND_BASE_URL http://${iface.address}:${config.port}`),
  );
}
console.log('The ESP8266 must get an address inside the same subnet (CIDR above) for a direct connection.');

section('API listening on this laptop');
try {
  const response = await fetch(`http://127.0.0.1:${config.port}/api/health`, { signal: AbortSignal.timeout(3000) });
  const body = await response.json();
  console.log(`OK: /api/health -> ${body.data.status} (database ${body.data.database.state})`);
} catch {
  console.log(`NOT reachable on 127.0.0.1:${config.port}. Start it with "npm run dev".`);
}
console.log('Note: requests from this laptop to its own IP skip the firewall. Test from a phone on the same network:');
for (const iface of interfaces.filter((i) => !i.likelyVirtual)) console.log(`  http://${iface.address}:${config.port}/api/health`);

if (process.platform === 'win32') {
  section('Windows network profile (Public networks block inbound connections by default)');
  console.log(await powershell('Get-NetConnectionProfile | ForEach-Object { "{0} ({1}): {2}" -f $_.InterfaceAlias, $_.Name, $_.NetworkCategory }'));

  section('Firewall rules for the honeypot (group "IoT Honeypot")');
  const rules = await powershell(
    "$r = Get-NetFirewallRule -Group 'IoT Honeypot' -ErrorAction SilentlyContinue; if (-not $r) { 'none: inbound TCP " +
      config.port +
      " from the ESP8266 is likely blocked. See backend/scripts/firewall-rule.ps1' } else { $r | ForEach-Object { '{0} enabled={1} profile={2} remote={3}' -f $_.DisplayName, $_.Enabled, $_.Profile, (($_ | Get-NetFirewallAddressFilter).RemoteAddress -join ',') } }",
  );
  console.log(rules);
}

section('If the ESP8266 still cannot connect');
console.log('See docs/NETWORKING.md: wrong/changed IP, different subnet, client (AP) isolation on hotspot or college Wi-Fi, firewall profile.');
console.log('The simulator keeps working on this laptop regardless of the device network.');

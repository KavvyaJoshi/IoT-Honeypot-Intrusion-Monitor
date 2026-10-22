import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOriginCheck } from '../../src/config/cors.js';
import { clearNetworkCache, inSubnet, interfaceForPeer, isOwnLanOrigin, lanInterfaces } from '../../src/utils/network.js';

const fakeInterfaces = {
  'Wi-Fi': [
    { family: 'IPv4', address: '192.168.43.10', cidr: '192.168.43.10/24', internal: false },
    { family: 'IPv6', address: 'fe80::1', cidr: 'fe80::1/64', internal: false },
  ],
  'vEthernet (WSL)': [{ family: 'IPv4', address: '172.28.0.1', cidr: '172.28.0.1/20', internal: false }],
  'Loopback Pseudo-Interface 1': [{ family: 'IPv4', address: '127.0.0.1', cidr: '127.0.0.1/8', internal: true }],
};

beforeEach(() => {
  clearNetworkCache();
  vi.spyOn(os, 'networkInterfaces').mockReturnValue(fakeInterfaces);
});
afterEach(() => {
  vi.restoreAllMocks();
  clearNetworkCache();
});

describe('lanInterfaces', () => {
  it('lists IPv4 LAN interfaces with physical adapters first and virtual ones flagged', () => {
    expect(lanInterfaces()).toEqual([
      { name: 'Wi-Fi', address: '192.168.43.10', cidr: '192.168.43.10/24', likelyVirtual: false },
      { name: 'vEthernet (WSL)', address: '172.28.0.1', cidr: '172.28.0.1/20', likelyVirtual: true },
    ]);
  });

  it('picks up a changed IP after the cache expires', () => {
    lanInterfaces(0);
    os.networkInterfaces.mockReturnValue({ 'Wi-Fi': [{ family: 'IPv4', address: '10.20.5.7', cidr: '10.20.5.7/22', internal: false }] });
    expect(lanInterfaces(5_000)[0].address).toBe('192.168.43.10');
    expect(lanInterfaces(20_000)[0].address).toBe('10.20.5.7');
  });
});

describe('subnet checks', () => {
  it.each([
    ['192.168.43.77', '192.168.43.10/24', true],
    ['192.168.44.77', '192.168.43.10/24', false],
    ['172.20.10.5', '172.20.10.3/28', true],
    ['172.20.10.20', '172.20.10.3/28', false],
    ['not-an-ip', '192.168.43.10/24', false],
  ])('%s in %s -> %s', (ip, cidr, expected) => {
    expect(inSubnet(ip, cidr)).toBe(expected);
  });

  it('finds the laptop interface on the device subnet', () => {
    expect(interfaceForPeer('192.168.43.50')?.name).toBe('Wi-Fi');
    expect(interfaceForPeer('10.0.0.5')).toBeNull();
  });
});

describe('CORS origin check', () => {
  const base = { corsOrigins: ['http://localhost:5173'], corsAllowLanOrigins: true, lanFrontendPorts: [5173, 4173] };

  it('accepts listed origins, the laptop LAN IP on dashboard ports, and requests without Origin', () => {
    const allowed = createOriginCheck(base);
    expect(allowed(undefined)).toBe(true);
    expect(allowed('http://localhost:5173')).toBe(true);
    expect(allowed('http://192.168.43.10:5173')).toBe(true);
    expect(allowed('http://192.168.43.10:4173')).toBe(true);
  });

  it('rejects other hosts, other ports and malformed origins', () => {
    const allowed = createOriginCheck(base);
    expect(allowed('http://192.168.43.77:5173')).toBe(false);
    expect(allowed('http://192.168.43.10:8080')).toBe(false);
    expect(allowed('https://evil.example')).toBe(false);
    expect(allowed('null')).toBe(false);
    expect(isOwnLanOrigin('file:///etc', [5173])).toBe(false);
  });

  it('allows only the explicit list when LAN origins are disabled', () => {
    const allowed = createOriginCheck({ ...base, corsAllowLanOrigins: false });
    expect(allowed('http://192.168.43.10:5173')).toBe(false);
    expect(allowed('http://localhost:5173')).toBe(true);
  });
});

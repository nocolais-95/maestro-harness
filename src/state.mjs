// Per-user device memory (outside any repo). Keyed by device serial, never by IP/SSID.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stateDir } from './platform.mjs';

const file = () => path.join(stateDir(), 'devices.json');

export function readState() {
  try { return existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : { last: null, devices: {} }; }
  catch { return { last: null, devices: {} }; }
}
export function writeState(s) {
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(file(), JSON.stringify(s, null, 2));
}
export function remember(serial, patch) {
  const s = readState();
  const d = s.devices[serial] || { ips: [] };
  const ips = [...new Set([...(patch.ip ? [patch.ip] : []), ...d.ips])].slice(0, 5);
  s.devices[serial] = { ...d, ...patch, ip: undefined, ips, seen: new Date().toISOString() };
  s.last = serial;
  writeState(s);
}

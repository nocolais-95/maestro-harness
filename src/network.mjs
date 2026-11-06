// Network-agnostic discovery of an adb-over-wifi device: no SSIDs or fixed IPs anywhere.
import net from 'node:net';
import os from 'node:os';
import { findBin, run } from './platform.mjs';

const adb = (args, timeout = 4000) => run(findBin('adb'), args, { timeout });

/** Active IPv4 /24 prefixes of the host (e.g. "192.168.1."). */
export function hostSubnets() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) {
        out.push({ ip: i.address, prefix: i.address.split('.').slice(0, 3).join('.') + '.' });
      }
    }
  }
  return out;
}

export const probe = (host, port = 5555, ms = 700) => new Promise((resolve) => {
  const s = new net.Socket();
  const done = (ok) => { s.destroy(); resolve(ok); };
  s.setTimeout(ms); s.once('connect', () => done(true));
  s.once('timeout', () => done(false)); s.once('error', () => done(false));
  s.connect(port, host);
});

export function connect(target) {
  const r = adb(['connect', target], 5000);
  return /connected to/i.test(r.out) && !/cannot|failed|unable/i.test(r.out);
}

export const serialAt = (id) => adb(['-s', id, 'shell', 'getprop', 'ro.serialno'], 5000).out.trim();

/** Wireless-debugging endpoints advertised over mDNS (Android 11+). */
export function mdnsEndpoints() {
  const r = adb(['mdns', 'services'], 4000);
  return [...r.out.matchAll(/_adb-tls-connect\._tcp\.?\s+(\S+:\d+)/g)].map((m) => m[1]);
}

/** Hosts on the current /24 subnets with port 5555 open. */
export async function scanSubnets(port = 5555) {
  const hosts = [];
  for (const { prefix, ip } of hostSubnets()) {
    for (let n = 1; n < 255; n++) if (prefix + n !== ip) hosts.push(prefix + n);
  }
  const open = [];
  await Promise.all(hosts.map(async (h) => { if (await probe(h, port)) open.push(h); }));
  return open;
}

/** One-line, actionable explanation when nothing was found. */
export function diagnose(saved) {
  const subnets = hostSubnets().map((s) => s.prefix + '0/24');
  const vpn = Object.keys(os.networkInterfaces()).some((n) => /^(tun|tap|wg|ppp)\d*/i.test(n));
  const bits = [];
  if (!subnets.length) bits.push('el host no tiene red activa');
  if (vpn) bits.push('hay una VPN activa en el host');
  bits.push(`host en ${subnets.join(', ') || 'sin red'}: el celu debe estar en la misma red (algunas redes aíslan clientes)`);
  if (saved?.ips?.length) bits.push(`última IP vista ${saved.ips[0]}`);
  return bits.join(' · ') + ' → enchufá USB una vez para re-mapear.';
}

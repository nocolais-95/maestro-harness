// Resolve a usable Android device: USB first, then a recovery ladder over wifi.
import { findBin, run } from './platform.mjs';
import * as nw from './network.mjs';
import { readState, remember } from './state.mjs';

const adbBin = () => findBin('adb');
const adb = (args, timeout = 8000) => run(adbBin(), args, { timeout });
export const sh = (id, cmd, timeout = 8000) => adb(['-s', id, 'shell', cmd], timeout).out.replace(/\r/g, '');

/** Like sh() but keeps stderr and exit code, for diagnostics. */
export const shx = (id, cmd, timeout = 8000) => adb(['-s', id, 'shell', cmd], timeout);

export function list() {
  return adb(['devices', '-l']).out.split('\n').slice(1).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [id, state] = l.split(/\s+/);
    return {
      id, state,
      transport: /:\d+$/.test(id) || id.includes('_adb-tls') ? 'wifi' : 'usb',
      model: (l.match(/model:(\S+)/) || [])[1] || '',
    };
  });
}

const wlanIp = (id) =>
  (sh(id, 'ip -f inet addr show wlan0').match(/inet (\d+\.\d+\.\d+\.\d+)/) || [])[1] || null;

/** Wifi-adb alias for a USB device: record its IP and enable tcpip once. */
function ensureWifi(usb, serial) {
  const ip = wlanIp(usb.id);
  if (!ip) return null;
  remember(serial, { ip, model: usb.model });
  if (list().some((d) => d.id === `${ip}:5555` && d.state === 'device')) return ip;
  adb(['-s', usb.id, 'tcpip', '5555'], 8000);
  nw.connect(`${ip}:5555`);
  return ip;
}

/**
 * @returns {{id, transport, serial, model, via, notes: string[]}} or {error}
 */
export async function resolve({ device, wifiAlias = true } = {}) {
  if (!adbBin()) return { error: 'adb no encontrado (instalá Android platform-tools o definí ANDROID_HOME).' };
  adb(['start-server']);
  const notes = [];
  const state = readState();
  const wanted = device || state.last;

  let devs = list();
  for (const d of devs.filter((x) => x.state === 'offline' && x.transport === 'wifi')) adb(['disconnect', d.id]);
  devs = list().filter((d) => d.state === 'device');
  if (device) devs = devs.filter((d) => d.id === device || sh(d.id, 'getprop ro.serialno') === device);

  const pick = (arr, via) => {
    const rank = (d) => (d.transport === 'usb' ? 0 : 1);
    const withSerial = arr.map((d) => ({ ...d, serial: sh(d.id, 'getprop ro.serialno') }));
    withSerial.sort((a, b) => (a.serial === wanted ? -1 : 0) - (b.serial === wanted ? -1 : 0) || rank(a) - rank(b));
    const d = withSerial[0];
    if (d.transport === 'usb' && wifiAlias) {
      const ip = ensureWifi(d, d.serial);
      if (ip) notes.push(`wifi alias ${ip}`);
    } else {
      remember(d.serial, { ip: d.transport === 'wifi' ? d.id.split(':')[0] : undefined, model: d.model });
    }
    return { ...d, via, notes };
  };

  if (devs.length) return pick(devs, 'direct');
  const blocked = list().filter((d) => ['unauthorized', 'authorizing'].includes(d.state));
  if (blocked.length) {
    return { error: `${blocked[0].id} está "${blocked[0].state}": desbloqueá el celu y aceptá el diálogo "¿Permitir depuración USB?" (tildá "Siempre"). Si no aparece: adb kill-server y reconectá el cable.` };
  }

  // Recovery ladder (each step short; stop at first verified hit).
  const saved = state.devices[wanted];
  const verify = (target) => {
    if (!nw.connect(target)) return false;
    const s = nw.serialAt(target);
    if (wanted && s && s !== wanted) { adb(['disconnect', target]); return false; }
    return !!s;
  };
  const known = (saved?.ips || []).map((ip) => `${ip}:5555`);
  const sameSubnet = new Set(nw.hostSubnets().map((s) => s.prefix));
  const likely = known.filter((t) => sameSubnet.has(t.split('.').slice(0, 3).join('.') + '.'));
  for (const t of likely) if (verify(t)) return pick(list().filter((d) => d.id === t), 'last-ip');
  for (const t of nw.mdnsEndpoints()) if (verify(t)) return pick(list().filter((d) => d.id === t), 'mdns');
  for (const h of await nw.scanSubnets()) {
    const t = `${h}:5555`;
    if (verify(t)) return pick(list().filter((d) => d.id === t), 'scan');
  }
  return { error: `Sin dispositivo. ${nw.diagnose(saved)}` };
}

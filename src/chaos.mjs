// Mobile "chaos" actions via adb, with guaranteed restoration.
import { findBin, run } from './platform.mjs';

const ACTIONS = {
  'wifi-off': { do: ['svc', 'wifi', 'disable'], undo: 'wifi-on', needsUsb: true },
  'wifi-on': { do: ['svc', 'wifi', 'enable'] },
  'data-off': { do: ['svc', 'data', 'disable'], undo: 'data-on' },
  'data-on': { do: ['svc', 'data', 'enable'] },
  'airplane-on': { do: ['cmd', 'connectivity', 'airplane-mode', 'enable'], undo: 'airplane-off', needsUsb: true },
  'airplane-off': { do: ['cmd', 'connectivity', 'airplane-mode', 'disable'] },
  home: { do: ['input', 'keyevent', 'KEYCODE_HOME'] },
  'rotate-landscape': { do: ['settings', 'put', 'system', 'user_rotation', '1'], pre: ['settings', 'put', 'system', 'accelerometer_rotation', '0'], undo: 'rotate-auto' },
  'rotate-portrait': { do: ['settings', 'put', 'system', 'user_rotation', '0'] },
  'rotate-auto': { do: ['settings', 'put', 'system', 'accelerometer_rotation', '1'] },
};

export const knownActions = () => Object.keys(ACTIONS);

/** "wifi-off@8s, wifi-on@20s" -> [{action, at}] */
export function parseTimeline(text) {
  return text.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^([a-z-]+)@(\d+)s$/);
    if (!m || !ACTIONS[m[1]]) throw new Error(`chaos inválido: "${s}" (válidos: ${knownActions().join(', ')})`);
    return { action: m[1], at: Number(m[2]) * 1000 };
  });
}

export class Chaos {
  constructor(deviceId, transport, appId) {
    this.id = deviceId; this.transport = transport; this.appId = appId;
    this.pending = new Set(); this.timers = [];
  }
  apply(name) {
    const a = ACTIONS[name];
    if (a.needsUsb && this.transport !== 'usb') {
      throw new Error(`"${name}" corta el wifi y el dispositivo está conectado por wifi-adb: conectá USB.`);
    }
    if (a.pre) run(findBin('adb'), ['-s', this.id, 'shell', ...a.pre]);
    run(findBin('adb'), ['-s', this.id, 'shell', ...a.do], { timeout: 10000 });
    if (a.undo) this.pending.add(a.undo);
    this.pending.delete(name);
  }
  schedule(timeline) {
    for (const t of timeline) this.timers.push(setTimeout(() => { try { this.apply(t.action); } catch (e) { console.error(e.message); } }, t.at));
  }
  /** Always call (finally / SIGINT). */
  async restore() {
    this.timers.forEach(clearTimeout);
    for (const name of [...this.pending]) { run(findBin('adb'), ['-s', this.id, 'shell', ...ACTIONS[name].do], { timeout: 10000 }); }
    this.pending.clear();
  }
}

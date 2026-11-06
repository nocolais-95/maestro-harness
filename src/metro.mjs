// Metro: ensure it's up and reachable from the device without depending on the LAN.
import { mkdirSync, openSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findBin, run, sleep } from './platform.mjs';

const status = (port) => new Promise((resolve) => {
  const req = http.get({ host: '127.0.0.1', port, path: '/status', timeout: 1500 }, (res) => {
    let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve(/running/.test(b)));
  });
  req.on('error', () => resolve(false)); req.on('timeout', () => { req.destroy(); resolve(false); });
});

export async function ensureMetro(cfg, deviceId, logDir) {
  const { port, command } = cfg.metro;
  let started = false;
  if (!(await status(port))) {
    if (!command) return { error: `Metro no responde en :${port} y no hay metro.command en maestro-harness.json.` };
    mkdirSync(logDir, { recursive: true });
    const log = openSync(path.join(logDir, 'metro.log'), 'a');
    const child = spawn(command, { cwd: cfg.root, shell: true, detached: true, stdio: ['ignore', log, log] });
    child.unref();
    started = true;
    for (let i = 0; i < 90 && !(await status(port)); i++) await sleep(1000);
    if (!(await status(port))) return { error: `Metro no levantó en 90s (ver ${path.join(logDir, 'metro.log')}).` };
  }
  const rev = run(findBin('adb'), ['-s', deviceId, 'reverse', `tcp:${port}`, `tcp:${port}`], { timeout: 8000 });
  if (rev.code !== 0) return { error: `adb reverse falló: ${rev.err || rev.out}` };
  const url = `http://localhost:${port}`;
  return { started, url, encoded: encodeURIComponent(url) };
}

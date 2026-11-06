// Cross-OS helpers: locate binaries and spawn them without relying on a shell.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const IS_WIN = process.platform === 'win32';
const EXT = IS_WIN ? ['.exe', '.bat', '.cmd', ''] : [''];

function onPath(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const e of EXT) {
      const p = path.join(dir, name + e);
      if (dir && existsSync(p)) return p;
    }
  }
  return null;
}

function firstExisting(dirs, name) {
  for (const d of dirs.filter(Boolean)) {
    for (const e of EXT) {
      const p = path.join(d, name + e);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const sdkRoots = () => [
  process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
  path.join(homedir(), 'Library/Android/sdk'),
  path.join(homedir(), 'Android/Sdk'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android/Sdk'),
  '/usr/local/share/android-commandlinetools',
].filter(Boolean);

const cache = {};
export function findBin(name) {
  if (cache[name] !== undefined) return cache[name];
  let p = onPath(name);
  if (!p && name === 'maestro') p = firstExisting([path.join(homedir(), '.maestro/bin')], 'maestro');
  if (!p && name === 'adb') p = firstExisting(sdkRoots().map((r) => path.join(r, 'platform-tools')), 'adb');
  return (cache[name] = p);
}

const needsShell = (bin) => IS_WIN && /\.(bat|cmd)$/i.test(bin);

/** Run and capture. Never throws; returns {code, out, err, timedOut}. */
export function run(bin, args = [], { timeout = 15000, cwd, env, input } = {}) {
  const r = spawnSync(bin, args, {
    encoding: 'utf8', timeout, cwd, input, shell: needsShell(bin),
    env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024,
  });
  return {
    code: r.status ?? -1, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(),
    timedOut: r.error?.code === 'ETIMEDOUT',
  };
}

/** Async spawn with inherited-or-captured output; resolves {code, timedOut}. */
export function runAsync(bin, args, { timeout = 0, cwd, env, onLine, detached = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd, env: { ...process.env, ...env }, shell: needsShell(bin), detached,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let timedOut = false;
    const t = timeout && setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeout);
    const feed = (b) => onLine && b.toString().split(/\r?\n/).forEach((l) => l && onLine(l));
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    child.on('close', (code) => { if (t) clearTimeout(t); resolve({ code: code ?? -1, timedOut }); });
    child.on('error', () => resolve({ code: -1, timedOut }));
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const stateDir = () => path.join(homedir(), '.maestro-harness');

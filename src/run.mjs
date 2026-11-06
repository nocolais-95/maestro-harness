// Doctor + run orchestration. Output is deliberately tiny.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBin, run, runAsync } from './platform.mjs';
import * as devices from './devices.mjs';
import { detect } from './profile.mjs';
import { ensureMetro } from './metro.mjs';
import { Chaos, parseTimeline } from './chaos.mjs';
import { summarize } from './report.mjs';

const pluginRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function doctor(cfg, opts = {}) {
  const res = { ok: false, lines: [] };
  const L = (s) => res.lines.push(s);
  if (!findBin('maestro')) { L('✗ maestro no encontrado (https://docs.maestro.dev/getting-started/installing-maestro)'); return res; }
  const dev = await devices.resolve({ device: opts.device });
  if (dev.error) { L(`✗ ${dev.error}`); return res; }
  const ping = devices.shx(dev.id, 'echo mh-ok');
  if (!ping.out.includes('mh-ok')) {
    L(`✗ El dispositivo ${dev.id} aparece en adb pero no responde a comandos: ${(ping.err || ping.out || 'sin salida').split('\n')[0]}`);
    L('  Probá: adb kill-server && adb devices · revisá que la depuración USB esté autorizada · en MIUI/Samsung revisá el diálogo de seguridad del celu · cambiá de cable/puerto.');
    return res;
  }
  const prof = detect(dev.id);
  res.dev = dev; res.prof = prof;
  L(`✓ ${prof.info} · ${dev.transport}${dev.transport === 'wifi' ? ' ' + dev.id : ''} · perfil ${prof.profile.name}${dev.via !== 'direct' ? ` (reencontrado por ${dev.via})` : ''}`);
  for (const w of prof.warnings) L(`⚠ ${w}`);
  const wn = (dev.notes || []).find((n) => n.startsWith('wifi'));
  if (wn) L(wn.startsWith('wifi listo') ? `✓ ${wn}: ya podés desconectar el USB (las próximas veces se reencuentra solo, aun cambiando de red)` : `⚠ ${wn}: sin wifi-adb hace falta USB cada vez. Conectá el celu y la Mac a la misma red.`);

  const pk = devices.sh(dev.id, 'pm list packages dev.mobile.maestro');
  const driver = /dev\.mobile\.maestro\b/.test(pk) && /dev\.mobile\.maestro\.test/.test(pk);
  res.flags = [...prof.runFlags];
  if (driver && !res.flags.includes('--no-reinstall-driver')) res.flags.push('--no-reinstall-driver');
  L(driver ? '✓ driver Maestro instalado (sin reinstalar)' : '⚠ driver Maestro no instalado: la primera corrida lo instala (puede pedir aceptar en el celu, una sola vez)');
  if (!driver) res.flags = res.flags.filter((f) => f !== '--no-reinstall-driver');

  if (cfg.appId) {
    const has = devices.sh(dev.id, `pm list packages ${cfg.appId}`).includes(`package:${cfg.appId}`);
    if (!has) { L(`✗ ${cfg.appId} no está instalada (instalá el dev client/build; el harness no compila).`); return res; }
    L(`✓ ${cfg.appId} instalada`);
  }
  if (cfg.metro?.port && !opts.noMetro) {
    const m = await ensureMetro(cfg, dev.id, path.join(cfg.testsAbs, 'reports'));
    if (m.error) { L(`✗ ${m.error}`); return res; }
    res.metro = m; L(`✓ Metro ${m.started ? 'levantado' : 'activo'} · reverse :${cfg.metro.port}`);
  }
  res.ok = true;
  return res;
}

const walkYaml = (d) => readdirSync(d).flatMap((f) => {
  const p = path.join(d, f);
  if (statSync(p).isDirectory()) return f === 'shared' ? [] : walkYaml(p);
  return /\.ya?ml$/.test(f) ? [p] : [];
});

export function resolveTargets(cfg, spec) {
  const [kind, ...rest] = spec.includes(':') && !/^[A-Za-z]:[\\/]/.test(spec) ? spec.split(':') : ['file', spec];
  const arg = rest.join(':');
  const tests = cfg.testsAbs;
  if (kind === 'suite') {
    const f = path.join(tests, 'suites', arg + '.txt');
    return { flows: readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => resolveFlow(cfg, l)), env: {} };
  }
  if (kind === 'task') {
    const txt = readFileSync(path.resolve(cfg.root, arg), 'utf8');
    const flows = [...txt.matchAll(/^flow:\s*(.+)$/gm)].map((m) => resolveFlow(cfg, m[1].trim()));
    const env = Object.fromEntries([...txt.matchAll(/^env:\s*(\w+)=(.*)$/gm)].map((m) => [m[1], m[2].trim()]));
    return { flows, env };
  }
  if (kind === 'common') return { flows: [path.join(pluginRoot, 'common-tests', arg + '.yaml')], env: {} };
  const p = resolveFlow(cfg, spec);
  return { flows: existsSync(p) && statSync(p).isDirectory() ? walkYaml(p) : [p], env: {} };
}

function resolveFlow(cfg, f) {
  if (f.startsWith('common:')) return path.join(pluginRoot, 'common-tests', f.slice(7) + '.yaml');
  for (const base of [process.cwd(), cfg.testsAbs, path.join(cfg.testsAbs, 'flows'), cfg.root]) {
    const p = path.resolve(base, f);
    if (existsSync(p)) return p;
  }
  throw new Error(`flow no encontrado: ${f}`);
}

export async function runFlows(cfg, spec, { env = {}, device, timeoutMin = 15, verbose = false } = {}) {
  const d = await doctor(cfg, { device });
  console.log(d.lines.join('\n'));
  if (!d.ok) return 2;
  const { flows, env: taskEnv } = resolveTargets(cfg, spec);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportDir = path.join(cfg.testsAbs, 'reports', ts);
  mkdirSync(reportDir, { recursive: true });

  const injected = {
    APP_ID: cfg.appId || '', ...(d.metro ? { METRO_URL: d.metro.encoded } : {}),
    ...(cfg.devClientScheme && d.metro ? { DEV_CLIENT_URL: `${cfg.devClientScheme}://expo-development-client/?url=${d.metro.encoded}` } : {}),
    ...cfg.env, ...taskEnv, ...env,
  };
  const args = ['--udid', d.dev.id, 'test', ...d.flags, '--format', 'junit', '--output', path.join(reportDir, 'report.xml'),
    '--debug-output', path.join(reportDir, 'debug'), '--flatten-debug-output'];
  for (const [k, v] of Object.entries(injected)) args.push('-e', `${k}=${v}`);

  // chaos timeline from "# chaos: wifi-off@8s, wifi-on@20s" header of a single flow
  const chaos = new Chaos(d.dev.id, d.dev.transport, cfg.appId);
  const header = flows.length === 1 ? (readFileSync(flows[0], 'utf8').match(/^#\s*chaos:\s*(.+)$/m) || [])[1] : null;
  const onSig = () => { chaos.restore().finally(() => process.exit(130)); };
  process.once('SIGINT', onSig);
  let code;
  try {
    if (header) chaos.schedule(parseTimeline(header));
    const r = await runAsync(findBin('maestro'), [...args, ...flows], {
      cwd: reportDir, timeout: timeoutMin * 60000, onLine: verbose ? (l) => console.log(l) : undefined,
    });
    code = r.timedOut ? 124 : r.code;
  } catch (e) { console.error(e.message); code = 2; }
  finally { await chaos.restore(); process.removeListener('SIGINT', onSig); }

  const s = summarize(reportDir);
  console.log(s.text);
  if (code === 124) console.log('✗ timeout');
  return s.ok && code === 0 ? 0 : 1;
}

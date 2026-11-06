#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.mjs';
import { doctor, runFlows } from '../src/run.mjs';
import * as devices from '../src/devices.mjs';
import { summarize } from '../src/report.mjs';
import { loadProfiles } from '../src/profile.mjs';
import { setup } from '../src/setup.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...rest] = process.argv.slice(2);

function parse(args) {
  const o = { env: {}, pos: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-e') { const [k, ...v] = args[++i].split('='); o.env[k] = v.join('='); }
    else if (a === '--device') o.device = args[++i];
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--yes' || a === '-y') o.yes = true;
    else if (a === '--timeout') o.timeoutMin = Number(args[++i]);
    else o.pos.push(a);
  }
  return o;
}
const need = () => {
  const c = loadConfig();
  if (!c) { console.error('No hay maestro-harness.json (corré `mh init`).'); process.exit(2); }
  return c;
};

const o = parse(rest);
switch (cmd) {
  case 'doctor': { const r = await doctor(need(), o); console.log(r.lines.join('\n')); process.exit(r.ok ? 0 : 2); break; }
  case 'run': {
    if (!o.pos[0]) { console.error('uso: mh run <flow|suite:x|task:file|common:x> [-e K=V] [--device ID]'); process.exit(2); }
    process.exit(await runFlows(need(), o.pos[0], o));
    break;
  }
  case 'devices': {
    const r = await devices.resolve({ device: o.device });
    console.log(r.error || `${r.id} (${r.transport}, ${r.model}) vía ${r.via}${r.notes.length ? ' · ' + r.notes.join(', ') : ''}`);
    process.exit(r.error ? 2 : 0); break;
  }
  case 'report': console.log(summarize(path.resolve(o.pos[0] || '.')).text); break;
  case 'profiles': for (const p of loadProfiles()) console.log(`${p.name}: ${(p.notes || []).join(' | ')}`); break;
  case 'setup': await setup({ yes: o.yes }); break;
  case 'init': {
    const dir = process.cwd();
    const cfgFile = path.join(dir, 'maestro-harness.json');
    if (!existsSync(cfgFile)) copyFileSync(path.join(root, 'templates/maestro-harness.json'), cfgFile);
    for (const sub of ['flows', 'flows/shared', 'suites', 'tasks', 'reports']) mkdirSync(path.join(dir, 'test/maestro', sub), { recursive: true });
    const gi = path.join(dir, '.gitignore');
    const line = '\n# maestro-harness\ntest/maestro/reports/\ntest/maestro/tasks/*\n!test/maestro/tasks/.gitkeep\n';
    if (!existsSync(gi) || !readFileSync(gi, 'utf8').includes('# maestro-harness')) appendFileSync(gi, line);
    writeFileSync(path.join(dir, 'test/maestro/tasks/.gitkeep'), '');
    if (!existsSync(path.join(dir, 'test/maestro/suites/smoke.txt'))) writeFileSync(path.join(dir, 'test/maestro/suites/smoke.txt'), '# un flow por línea, relativo a test/maestro/flows\n');
    console.log('Listo. Editá maestro-harness.json (appId, devClientScheme, metro.command) y corré `mh doctor`.');
    break;
  }
  default:
    console.log('mh setup [--yes] | doctor | run <spec> | devices | report <dir> | profiles | init');
    process.exit(cmd ? 2 : 0);
}

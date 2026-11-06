// `mh setup`: one command to install the harness structure in a project and onboard the developer.
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { findBin, run, IS_WIN } from './platform.mjs';
import { loadConfig } from './config.mjs';
import { runFlows } from './run.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

const HINTS = {
  node: 'https://nodejs.org (v18+)',
  maestro: IS_WIN ? 'https://docs.maestro.dev/getting-started/installing-maestro/windows' : 'curl -fsSL "https://get.maestro.mobile.dev" | bash',
  adb: 'Android Studio → SDK Manager → Platform-Tools (y definí ANDROID_HOME)',
  java: 'JDK 17+ (https://adoptium.net)',
};

function prereqs() {
  const javaOk = run('java', ['-version'], { timeout: 5000 }).code === 0;
  const rows = [
    ['node', Number(process.versions.node.split('.')[0]) >= 18],
    ['maestro', !!findBin('maestro')], ['adb', !!findBin('adb')], ['java', javaOk],
  ];
  for (const [n, ok] of rows) console.log(`  ${ok ? '✓' : '✗'} ${n}${ok ? '' : '  → ' + HINTS[n]}`);
  return rows.every(([, ok]) => ok);
}

function detectProject(dir) {
  const pkg = readJson(path.join(dir, 'package.json'));
  const app = readJson(path.join(dir, 'app.json'))?.expo || {};
  const pm = existsSync(path.join(dir, 'yarn.lock')) ? 'yarn'
    : existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(path.join(dir, 'bun.lockb')) ? 'bun' : 'npm';
  const hasStart = !!pkg?.scripts?.start;
  const metro = pm === 'yarn' ? 'yarn start --dev-client' : hasStart ? `${pm} run start -- --dev-client` : `${pm === 'npm' ? 'npx' : pm + ' dlx'} expo start --dev-client`;
  return {
    isExpo: !!pkg?.dependencies?.expo,
    appId: app.android?.package || app.ios?.bundleIdentifier || 'com.example.app',
    scheme: app.scheme ? `exp+${String(Array.isArray(app.scheme) ? app.scheme[0] : app.scheme).replace(/^exp\+/, '')}` : app.slug ? `exp+${app.slug}` : null,
    metro,
  };
}

const STARTER = `# Test de prueba: abre la app y saca una captura. No crea ni modifica datos.
appId: \${APP_ID}
---
- launchApp
- waitForAnimationToEnd
- takeScreenshot: starter-home
`;
const STARTER_DEV = `# Test de prueba: abre el dev client apuntando a Metro y saca una captura. No crea datos.
appId: \${APP_ID}
---
- stopApp
- openLink: "\${DEV_CLIENT_URL}"
- waitForAnimationToEnd:
    timeout: 60000
- takeScreenshot: starter-home
`;

const GUIDE = (tests) => `
Cómo funciona
  • Todo es opt-in: nada corre solo. Vos (o tu agente) lo pedís.
  • mh doctor        → chequea celu (USB/wifi, aunque cambies de red), perfil del fabricante, app, Metro.
  • mh run <spec>    → doctor + ejecuta + informe corto. <spec> = archivo, carpeta, suite:smoke,
                       task:<archivo.md> o common:<test> (wifi-off-recovery, rotate, background-resume…).
  • Tus tests viven en ${tests}/flows/<feature>/ y las listas en ${tests}/suites/*.txt
  • En los flows usá \${APP_ID} y \${DEV_CLIENT_URL}; nunca IPs.
  • Con un agente: decile "probá X en el celu"; la skill maestro-harness arma el flow, lo corre y te informa.
  • Si algo falla en un dispositivo raro, se registra en profiles/<fabricante>.json del harness.
`;

export async function setup({ yes = false, dir = process.cwd() } = {}) {
  const ask = yes ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
  const confirm = async (q, def = true) => {
    if (yes) return def;
    const a = (await ask.question(`${q} ${def ? '[S/n]' : '[s/N]'} `)).trim().toLowerCase();
    return a === '' ? def : /^(s|si|sí|y|yes)/.test(a);
  };
  const input = async (q, def) => (yes ? def : ((await ask.question(`${q} [${def ?? ''}] `)).trim() || def));
  try {
    console.log('maestro-harness · setup\n\nRequisitos:');
    const okReq = prereqs();
    if (!okReq) console.log('\n  (Podés seguir; instalá lo que falta antes de correr tests.)');

    const d = detectProject(dir);
    if (!d.isExpo) console.log('\n⚠ No parece un proyecto Expo; el harness igual sirve para cualquier app Android (ajustá metro.command o dejalo vacío).');
    const existing = loadConfig(dir);
    let cfgPath = path.join(dir, 'maestro-harness.json');
    let cfg;
    if (existing && existing.root === dir) { cfg = existing; console.log('\n✓ maestro-harness.json ya existe, no lo toco.'); }
    else {
      console.log('\nConfiguración (Enter acepta lo detectado):');
      const appId = await input('  appId', d.appId);
      const scheme = await input('  scheme del dev client (vacío si no usás dev client)', d.scheme || '');
      const metro = scheme ? await input('  comando de Metro', d.metro) : '';
      cfg = { appId, devClientScheme: scheme || null, metro: { port: 8081, command: metro || null }, testsDir: 'test/maestro', env: {}, contextHints: ['docs/specs'] };
      if (!scheme) delete cfg.devClientScheme;
      writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
      console.log('✓ maestro-harness.json');
    }
    const tests = path.join(dir, cfg.testsDir || 'test/maestro');
    for (const sub of ['flows/smoke', 'flows/shared', 'suites', 'tasks', 'reports']) mkdirSync(path.join(tests, sub), { recursive: true });
    const starter = path.join(tests, 'flows/smoke/starter.yaml');
    if (!existsSync(starter)) writeFileSync(starter, cfg.devClientScheme ? STARTER_DEV : STARTER);
    const smoke = path.join(tests, 'suites/smoke.txt');
    if (!existsSync(smoke)) writeFileSync(smoke, '# un flow por línea, relativo a flows/\nsmoke/starter.yaml\n');
    writeFileSync(path.join(tests, 'tasks/.gitkeep'), '');
    const gi = path.join(dir, '.gitignore');
    const rel = path.relative(dir, tests).split(path.sep).join('/');
    if (!existsSync(gi) || !readFileSync(gi, 'utf8').includes('# maestro-harness')) {
      appendFileSync(gi, `\n# maestro-harness\n${rel}/reports/\n${rel}/tasks/*\n!${rel}/tasks/.gitkeep\n`);
    }
    console.log(`✓ estructura en ${rel}/ (flows, suites, tasks, reports) + test de prueba`);

    if (await confirm('\n¿Instalar la skill y agentes para Claude Code en .claude/ de este proyecto?')) {
      const sk = path.join(dir, '.claude/skills/maestro-harness');
      mkdirSync(sk, { recursive: true });
      copyFileSync(path.join(root, 'skills/maestro-harness/SKILL.md'), path.join(sk, 'SKILL.md'));
      cpSync(path.join(root, 'agents'), path.join(dir, '.claude/agents'), { recursive: true });
      console.log('✓ .claude/skills/maestro-harness + .claude/agents');
    }
    if (findBin('claude') && await confirm('¿Registrar el MCP de Maestro en Claude Code (inspeccionar pantalla al escribir tests)?', false)) {
      const r = run(findBin('claude'), ['mcp', 'add', '-s', 'user', 'maestro', '--', findBin('maestro') || 'maestro', 'mcp'], { timeout: 20000 });
      console.log(r.code === 0 ? '✓ MCP maestro agregado (reiniciá Claude Code)' : `✗ ${r.err || r.out}`);
    }

    console.log(GUIDE(rel));
    if (okReq && await confirm('¿Corro ahora el test de prueba (suite:smoke) con tu celu conectado?', false)) {
      const code = await runFlows(loadConfig(dir), 'suite:smoke', {});
      console.log(code === 0 ? '\n✓ Todo funciona.' : '\nSi falló, corré `mh doctor` para ver qué falta.');
    } else console.log('Cuando quieras: mh doctor  y después  mh run suite:smoke');
  } finally { ask?.close(); }
}

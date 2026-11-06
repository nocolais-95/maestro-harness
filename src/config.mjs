// Project config discovery. Only maestro-harness.json is project-specific.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  appId: null, devClientScheme: null,
  metro: { port: 8081, command: null },
  testsDir: 'test/maestro', env: {}, contextHints: [],
};

export function loadConfig(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    const f = path.join(dir, 'maestro-harness.json');
    if (existsSync(f)) {
      const raw = JSON.parse(readFileSync(f, 'utf8'));
      const c = { ...DEFAULTS, ...raw, metro: { ...DEFAULTS.metro, ...(raw.metro || {}) } };
      c.root = dir; c.testsAbs = path.resolve(dir, c.testsDir);
      return c;
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

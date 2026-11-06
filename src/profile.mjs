// Match a device to an OEM/OS profile and run its preflight checks.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sh } from './devices.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'profiles');

export function getProps(id) {
  const props = {};
  for (const m of sh(id, 'getprop', 15000).matchAll(/^\[([^\]]+)\]: \[(.*)\]$/gm)) props[m[1]] = m[2];
  return props;
}

export function loadProfiles() {
  return readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

const matches = (p, props) => (p.match || []).every((m) => {
  const v = props[m.prop];
  if (m.equals !== undefined) return v === m.equals;
  if (m.matches) return new RegExp(m.matches, 'i').test(v || '');
  return !!v;
});

export function detect(id) {
  const props = getProps(id);
  const profile = loadProfiles().find((p) => !p.generic && matches(p, props))
    || loadProfiles().find((p) => p.generic);
  const info = `${props['ro.product.manufacturer'] || '?'} ${props['ro.product.model'] || ''} · Android ${props['ro.build.version.release'] || '?'}`;
  const warnings = [];
  for (const c of profile.preflight || []) {
    if (c.check === 'prop' && (props[c.key] ?? '') !== c.expect) warnings.push(c.onFail);
  }
  return { profile, props, info, warnings, runFlags: profile.runFlags || [] };
}

// Condense a JUnit file + debug output into a short table (what the agent should read).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function findScreens(dir) {
  const out = [];
  const walk = (d, depth = 0) => {
    if (depth > 4 || !existsSync(d)) return;
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p, depth + 1); else if (/\.png$/.test(f)) out.push(p);
    }
  };
  walk(dir);
  return out.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

export function summarize(reportDir) {
  const xml = path.join(reportDir, 'report.xml');
  const rows = [];
  if (existsSync(xml)) {
    const s = readFileSync(xml, 'utf8');
    for (const m of s.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const name = unesc((m[1].match(/name="([^"]*)"/) || [])[1] || '?');
      const body = m[3] || '';
      const fail = body.match(/<(failure|error)[^>]*?(?:message="([^"]*)")?[^>]*?>([\s\S]*?)<\/\1>|<(failure|error)\b[^>]*message="([^"]*)"/);
      const msg = fail ? unesc((fail[2] || fail[5] || fail[3] || '').split('\n')[0]).slice(0, 160) : '';
      rows.push({ name, ok: !fail && !/<skipped/.test(body), msg });
    }
  }
  const screens = findScreens(reportDir);
  const lines = [];
  const bad = rows.filter((r) => !r.ok);
  lines.push(`${rows.length - bad.length}/${rows.length} PASS · reporte: ${reportDir}`);
  for (const r of rows.slice(0, 12)) lines.push(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  → ' + r.msg}`);
  if (bad.length && screens[0]) lines.push(`screenshot: ${screens[0]}`);
  return { ok: rows.length > 0 && bad.length === 0, text: lines.join('\n'), rows };
}

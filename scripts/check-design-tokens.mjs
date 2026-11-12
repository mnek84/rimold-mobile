#!/usr/bin/env node
/**
 * Fails when a colour literal or a raw font size appears outside src/theme/.
 *
 *   node scripts/check-design-tokens.mjs            # whole src/
 *   node scripts/check-design-tokens.mjs src/modules/bodega   # one folder/file
 *
 * Rules (see src/theme/DESIGN_SYSTEM.md):
 *   color      hex / rgb() / hsl() / named colour literals
 *   alpha      tint built by string concat on a token: colors.x + '22', `${colors.x}66`
 *   fontSize   numeric fontSize — use typography tokens
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const targets = process.argv.slice(2);
const roots = targets.length > 0 ? targets : ['src'];
const ALLOWED_DIR = 'src/theme/';

const NAMED = '(?:white|black|red|green|blue|orange|yellow|gray|grey|purple|pink)';
const RULES = [
  { id: 'color', re: /['"`]#[0-9a-fA-F]{3,8}['"`]|\brgba?\(|\bhsla?\(/ },
  { id: 'color', re: new RegExp(`(?:color|Color|backgroundColor|borderColor|tint|pinColor)\\s*[:=]\\s*\\{?\\s*['"]${NAMED}['"]`) },
  { id: 'alpha', re: /colors\.\w+\s*\+\s*['"`]|\$\{\s*(?:theme\.)?colors\.\w+\s*\}[0-9a-fA-F]{2}/ },
  { id: 'fontSize', re: /fontSize\s*:\s*\d/ },
];

function walk(p, out) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const f of readdirSync(p)) walk(join(p, f), out);
  } else if (/\.(tsx?|jsx?)$/.test(p)) {
    out.push(p);
  }
  return out;
}

const files = roots.flatMap((r) => walk(join(ROOT, r), []));
const hits = [];
for (const abs of files) {
  const rel = relative(ROOT, abs).replace(/\\/g, '/');
  if (rel.startsWith(ALLOWED_DIR)) continue;
  const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) hits.push(`${rel}:${i + 1}  [${rule.id}]  ${trimmed}`);
    }
  });
}

if (hits.length > 0) {
  console.log(hits.join('\n'));
  console.log(`\n${hits.length} design-token violation(s). See src/theme/DESIGN_SYSTEM.md`);
  process.exit(1);
}
console.log(`OK — ${files.length} files, no design-token violations.`);

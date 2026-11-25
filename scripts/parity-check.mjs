// Build-time parity gate for Token Radar (radar-6): the dashboard's parity.js must
// re-derive every board row's implied value from the fitted model, byte for byte the
// way lib/model.ts scored it. Run by main.ts after it writes /output; exits non-zero
// on any mismatch, so a drifted formula fails the build instead of the entry.
//
//   node scripts/parity-check.mjs --parity dashboard/parity.js --data out/data.js --board out/board.json
//
// Standard library only. The two input scripts are loaded in a bare function scope
// with a stand-in window object, never evaluated against this process's globals.
import { readFileSync } from 'node:fs';

function arg(name) {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1];
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? null : withEquals.slice(name.length + 3);
}

const parityPath = arg('parity');
const dataPath = arg('data');
const boardPath = arg('board');
if (!parityPath || !dataPath || !boardPath) {
  process.stderr.write('parity-check: usage: node scripts/parity-check.mjs --parity <parity.js> --data <data.js> --board <board.json>\n');
  process.exit(2);
}

// parity.js is a classic script that hangs its API off window; give it a stand-in.
const parityWindow = {};
new Function('window', readFileSync(parityPath, 'utf8'))(parityWindow);
const parity = parityWindow.TokenRadarParity;
if (!parity || typeof parity.parityCheck !== 'function') {
  process.stderr.write(`parity-check: ${parityPath} does not expose window.TokenRadarParity.parityCheck\n`);
  process.exit(2);
}

// data.js is `window.RADAR = {...};` — same stand-in, then read the dataset back off it.
const dataWindow = {};
new Function('window', readFileSync(dataPath, 'utf8'))(dataWindow);
const data = dataWindow.RADAR;
if (!data || !Array.isArray(data.rows)) {
  process.stderr.write(`parity-check: ${dataPath} does not set window.RADAR.rows\n`);
  process.exit(2);
}

const board = JSON.parse(readFileSync(boardPath, 'utf8'));
const boardBySlug = new Map(board.rows.map((r) => [r.slug, r.implied_value_usd]));
const check = parity.parityCheck(data);
const boardMismatches = [];
for (const row of data.rows) {
  if (boardBySlug.get(row.slug) !== row.implied_value_usd) boardMismatches.push(row.slug);
}
process.stdout.write(
  `parity-check: ${check.matched}/${check.total} rows recompute identically in-page` +
    (check.mismatched.length > 0 ? `; mismatched: ${check.mismatched.slice(0, 5).join(', ')}` : '') +
    (boardMismatches.length > 0 ? `; board.json disagrees on: ${boardMismatches.slice(0, 5).join(', ')}` : '') +
    '\n',
);
if (check.matched !== check.total || check.total === 0 || boardMismatches.length > 0) process.exit(1);

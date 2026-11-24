// Validates src/data/openingGuides.ts.
// Run from the project root: npx tsx scripts/check-opening-guides.ts
//
// Checks every guide: main line legal from the start position, 8–16 plies,
// one note per ply (≤160 chars), trap sequences legal, unique kebab-case ids,
// 3–5 ideas, and that `name` is a family name in the Lichess chess-openings
// dataset (CC0). The dataset TSVs are downloaded to a temp dir, not committed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import { OPENING_GUIDES } from '../src/data/openingGuides';

const DATA_DIR = process.env.LICHESS_OPENINGS_DIR ?? '/private/tmp/claude-502/lichess-openings';
const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';

type Row = { eco: string; name: string; moves: string };

function loadDataset(): Row[] {
  mkdirSync(DATA_DIR, { recursive: true });
  const rows: Row[] = [];
  for (const f of ['a', 'b', 'c', 'd', 'e']) {
    const file = join(DATA_DIR, `${f}.tsv`);
    if (!existsSync(file)) execFileSync('curl', ['-sSfL', '-o', file, `${BASE}/${f}.tsv`]);
    for (const line of readFileSync(file, 'utf8').split('\n').slice(1)) {
      const [eco, name, pgn] = line.split('\t');
      if (!eco || !name || !pgn) continue;
      // "1. e4 e5 2. Nf3" → "e4 e5 Nf3"
      const moves = pgn.split(/\s+/).filter((t) => !/^\d+\.$/.test(t)).join(' ');
      rows.push({ eco, name, moves });
    }
  }
  return rows;
}

const familyOf = (name: string) => (name.includes(':') ? name.slice(0, name.indexOf(':')) : name);

/** Plays SAN moves from the start; returns the index of the first illegal move, or -1. */
function firstIllegal(sans: string[]): number {
  const chess = new Chess();
  for (let i = 0; i < sans.length; i++) {
    try {
      chess.move(sans[i]);
    } catch {
      return i;
    }
  }
  return -1;
}

const dataset = loadDataset();
const families = new Set(dataset.map((r) => familyOf(r.name)));
const errors: string[] = [];
const info: string[] = [];
const ids = new Set<string>();

for (const g of OPENING_GUIDES) {
  const err = (msg: string) => errors.push(`[${g.id}] ${msg}`);

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.id)) err('id is not kebab-case');
  if (ids.has(g.id)) err('duplicate id');
  ids.add(g.id);
  if (!families.has(g.name)) err(`name "${g.name}" is not a Lichess family name`);
  if (!/^[A-E]\d\d$/.test(g.eco)) err(`bad eco "${g.eco}"`);
  if (/\d+\./.test(g.moves)) err('moves contain move numbers');

  const sans = g.moves.trim().split(/\s+/);
  if (sans.length < 8 || sans.length > 16) err(`main line has ${sans.length} plies (want 8–16)`);
  const bad = firstIllegal(sans);
  if (bad >= 0) err(`illegal move #${bad + 1} "${sans[bad]}" in main line`);
  if (g.notes.length !== sans.length) err(`notes.length ${g.notes.length} ≠ plies ${sans.length}`);
  g.notes.forEach((n, i) => {
    if (!n.trim()) err(`note ${i + 1} is empty`);
    if (n.length > 160) err(`note ${i + 1} is ${n.length} chars (max 160)`);
  });
  if (g.ideas.length < 3 || g.ideas.length > 5) err(`${g.ideas.length} ideas (want 3–5)`);
  if (!g.summary.trim() || !g.watchOut.trim()) err('empty summary or watchOut');
  if ((g.traps?.length ?? 0) > 2) err('more than 2 traps');
  for (const t of g.traps ?? []) {
    const tm = t.moves.trim().split(/\s+/);
    const tb = firstIllegal(tm);
    if (tb >= 0) err(`trap "${t.name}": illegal move #${tb + 1} "${tm[tb]}"`);
    if (!t.note.trim()) err(`trap "${t.name}" has no note`);
  }

  // Informational: deepest dataset line that is a prefix of the guide's moves.
  let best: Row | undefined;
  for (const r of dataset) {
    if ((g.moves + ' ').startsWith(r.moves + ' ') && (!best || r.moves.length > best.moves.length)) best = r;
  }
  info.push(
    `${g.id.padEnd(30)} ${g.side} ${g.group.padEnd(6)} ${g.eco}  deepest: ${best ? `${best.eco} ${best.name}` : '—'}` +
      (best && familyOf(best.name) !== g.name ? `   (family differs from "${g.name}")` : ''),
  );
}

console.log(info.join('\n'));
console.log(`\n${OPENING_GUIDES.length} guides checked against ${dataset.length} dataset lines.`);
if (errors.length) {
  console.log(`\n${errors.length} problem(s):\n` + errors.join('\n'));
  process.exit(1);
}
console.log('ALL OK');

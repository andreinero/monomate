/**
 * Builds the bundled data files from the Lichess open data (both CC0):
 *   - src/data/openings.json  ← github.com/lichess-org/chess-openings ({a..e}.tsv)
 *   - src/data/puzzlePack.json ← database.lichess.org/#puzzles (a CSV slice of lichess_db_puzzle.csv)
 *
 * Run: npx tsx scripts/build-data.ts <dir with a.tsv..e.tsv> <puzzles.csv>
 */
import fs from 'fs';
import path from 'path';
import { Chess } from 'chess.js';

const [, , tsvDir, puzzleCsv] = process.argv;
if (!tsvDir || !puzzleCsv) throw new Error('usage: build-data.ts <tsvDir> <puzzles.csv>');
const OUT = path.join(__dirname, '..', 'src', 'data');

const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

// ---------- Openings ----------
type OpeningRow = [eco: string, name: string, moves: string, epd: string];
const openings: OpeningRow[] = [];
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const lines = fs.readFileSync(path.join(tsvDir, `${f}.tsv`), 'utf8').trim().split('\n').slice(1);
  for (const l of lines) {
    const [eco, name, pgn] = l.split('\t');
    const san = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
    const c = new Chess();
    for (const m of san) c.move(m);
    openings.push([eco, name, san.join(' '), epd(c.fen())]);
  }
}
fs.writeFileSync(path.join(OUT, 'openings.json'), JSON.stringify(openings));
console.log('openings:', openings.length);

// ---------- Puzzles ----------
export const PACK_THEMES = [
  'mateIn1', 'mateIn2', 'mateIn3', 'fork', 'pin', 'skewer', 'discoveredAttack', 'hangingPiece', 'sacrifice',
  'deflection', 'attraction', 'backRankMate', 'smotheredMate', 'trappedPiece', 'promotion', 'advancedPawn',
  'kingsideAttack', 'defensiveMove', 'quietMove', 'exposedKing', 'capturingDefender', 'intermezzo', 'xRayAttack',
  'zugzwang', 'doubleCheck', 'endgame', 'rookEndgame', 'pawnEndgame', 'opening', 'middlegame',
];
type Cand = { id: string; fen: string; last: string; sol: string; rating: number; themes: string[]; pop: number };
const cands: Cand[] = [];
const rows = fs.readFileSync(puzzleCsv, 'utf8').split('\n').slice(1);
for (const r of rows) {
  const c = r.split(',');
  if (c.length < 8) continue;
  const [id, fen, moves, rating, rd, pop, plays, themes] = c;
  if (+rd > 90 || +pop < 85 || +plays < 300) continue;
  const mv = moves.split(' ');
  // The CSV position is *before* the opponent's last move; the app shows it after.
  const ch = new Chess(fen);
  try {
    ch.move({ from: mv[0].slice(0, 2), to: mv[0].slice(2, 4), promotion: mv[0][4] });
  } catch {
    continue;
  }
  cands.push({ id, fen: ch.fen(), last: mv[0], sol: mv.slice(1).join(' '), rating: +rating, themes: themes.split(' '), pop: +pop });
}
// Shuffle deterministically so buckets get a mix.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
cands.sort(() => rnd() - 0.5);

const picked = new Map<string, Cand>();
// 1) A ladder across ratings (Rush, Streak and the offline fallback climb it).
const perBucket = new Map<number, number>();
for (const p of cands) {
  const b = Math.floor(p.rating / 100);
  if (b < 4 || b > 29) continue;
  const n = perBucket.get(b) ?? 0;
  if (n >= 110) continue;
  perBucket.set(b, n + 1);
  picked.set(p.id, p);
}
// 2) Enough of every theme, spread over ratings.
for (const t of PACK_THEMES) {
  const have = [...picked.values()].filter((p) => p.themes.includes(t)).length;
  const need = 120 - have;
  if (need <= 0) continue;
  const extra = cands.filter((p) => !picked.has(p.id) && p.themes.includes(t)).sort((a, b) => a.rating - b.rating);
  const step = Math.max(1, extra.length / need);
  for (let i = 0; i < extra.length && picked.size < 99999; i += step) {
    const p = extra[Math.floor(i)];
    picked.set(p.id, p);
    if ([...picked.values()].filter((x) => x.themes.includes(t)).length >= 120) break;
  }
}
const pack = [...picked.values()]
  .sort((a, b) => a.rating - b.rating)
  .map((p) => [p.id, p.fen, p.last, p.sol, p.rating, p.themes.join(' ')]);
fs.writeFileSync(path.join(OUT, 'puzzlePack.json'), JSON.stringify(pack));
console.log('puzzles:', pack.length, 'from', cands.length, 'candidates');
for (const t of PACK_THEMES) console.log(' ', t, pack.filter((p) => (p[5] as string).split(' ').includes(t)).length);
console.log('size KB:', Math.round(fs.statSync(path.join(OUT, 'puzzlePack.json')).size / 1024), '/', Math.round(fs.statSync(path.join(OUT, 'openings.json')).size / 1024));

import { Game } from '../src/engine/sim';
import { isBuildableTile, Tile } from '../src/engine/world';

const SEED = 20261102;
const tileAt = (g: Game, x: number, y: number) => g.terrain.tiles[y * g.terrain.width + x];
function site(g: Game, w: number, h: number, ore: number) {
  const { width, height, zones } = g.terrain;
  for (let y = 1; y + h <= height; y++) for (let x = 0; x + w <= width; x++) {
    let ok = true;
    for (let cy = y - 1; cy < y + h - 1 && ok; cy++) for (let cx = x; cx < x + w && ok; cx++) ok = cy >= 0 && isBuildableTile(tileAt(g, cx, cy)) && zones[cy * width + cx] === 0;
    if (ok && [0, 1].every((a) => [0, 1].every((b) => tileAt(g, x + a, y + b) === ore))) return { x, y };
  }
  throw new Error('no site');
}
function rate(build: (g: Game, x: number, y: number) => void, ore = Tile.Iron, mk = 1) {
  const g = new Game(SEED);
  g.score = 1e9;
  for (const t of ['smelting', 'smelting_copper', 'logistics', 'assembly', 'wiring', 'electronics']) g.research(t);
  for (let i = 2; i <= mk; i++) { g.score = 1e9; for (const t of ['land_1', 'land_2', 'robotics']) g.research(t); g.researchTier(); }
  const { x, y } = site(g, 16, 6, ore);
  build(g, x, y);
  const warm = 1200, span = 4800; // 60 s de aquecimento, medir 240 s
  for (let i = 0; i < warm; i++) g.step();
  const s0 = g.score;
  for (let i = 0; i < span; i++) g.step();
  return (g.score - s0) / (span / 20);
}
const out: Record<string, number> = {};
const mkBuild = (mk: number, upTo: 'hub' | 'furnace' | 'assembler') => (g: Game, x: number, y: number) => {
  g.place('miner', x, y, 0, mk);
  if (upTo === 'hub') { g.place('hub', x + 2, y, 0); return; }
  g.place('furnace', x + 2, y, 0, mk);
  if (upTo === 'furnace') { g.place('hub', x + 4, y, 0); return; }
  g.place('conveyor', x + 4, y, 0); g.place('conveyor', x + 5, y, 0);
  g.place('assembler', x + 6, y - 1, 0, mk); g.setRecipe(x + 6, y - 1, 'gear');
  g.place('hub', x + 9, y, 0);
};
for (const mk of [1, 2]) {
  out[`A miner->hub Mk${mk}`] = rate(mkBuild(mk, 'hub'), Tile.Iron, mk);
  out[`B +furnace Mk${mk}`] = rate(mkBuild(mk, 'furnace'), Tile.Iron, mk);
  out[`C +assembler(gear) Mk${mk}`] = rate(mkBuild(mk, 'assembler'), Tile.Iron, mk);
}
console.log(JSON.stringify(out, null, 1));

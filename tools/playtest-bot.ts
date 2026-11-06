/**
 * Bot jogador: joga a temporada no motor real (sem navegador) com uma política simples e imprime o ritmo.
 * Uso: npx vite-node tools/playtest-bot.ts [dias=1]
 *
 * Política (um jogador atento, mas não ótimo): a cada minuto de jogo primeiro investe em renda, construindo "linhas"
 * (mineradora → fornalha → montadora de engrenagem → Central) no melhor modelo liberado, mantendo-as à frente das pesquisas;
 * com as linhas em dia, ou sem espaço, pesquisa o que der. Não faz fio, circuito nem motor, não amplia linhas antigas e não usa cobre: a renda real de um
 * bom jogador tende a ser MAIOR; os tempos de pesquisa, MENORES.
 */
import { BUILDING_SIZE, buildCost, removalCost, TECHS, TIERED_KINDS } from '../src/engine/data';
import { Game } from '../src/engine/sim';
import type { BuildingKind, Dir } from '../src/engine/types';
import { Tile } from '../src/engine/world';

const SEED = 20261102;
const DAYS = Number(process.argv[2] ?? 1);
const TPS = 20;
const DECIDE_EVERY = 60 * TPS;
const MAX_LINES = 40;
const RESEARCH_ORDER = ['smelting', 'logistics', 'assembly', 'land_1', 'smelting_copper', 'wiring', 'electronics', 'mk2', 'land_2', 'robotics', 'mk3', 'land_3', 'overclock', 'mk4', 'mk5', 'mk6', 'mk7', 'mk8'];

type Piece = { kind: BuildingKind; dx: number; dy: number };
const TEMPLATES: Record<'raw' | 'plate' | 'gear', { top: number; width: number; pieces: Piece[] }> = {
  raw: { top: 0, width: 4, pieces: [{ kind: 'miner', dx: 0, dy: 0 }, { kind: 'hub', dx: 2, dy: 0 }] },
  plate: { top: 0, width: 6, pieces: [{ kind: 'miner', dx: 0, dy: 0 }, { kind: 'furnace', dx: 2, dy: 0 }, { kind: 'hub', dx: 4, dy: 0 }] },
  gear: {
    top: -1,
    width: 10,
    pieces: [{ kind: 'miner', dx: 0, dy: 0 }, { kind: 'furnace', dx: 2, dy: 0 }, { kind: 'conveyor', dx: 4, dy: 0 }, { kind: 'conveyor', dx: 5, dy: 0 }, { kind: 'assembler', dx: 6, dy: -1 }, { kind: 'hub', dx: 9, dy: 0 }],
  },
};

const game = new Game(SEED);
const { width, height } = game.terrain;
const tile = (x: number, y: number) => game.terrain.tiles[y * width + x];
const ironUnder = (x: number, y: number) => [0, 1].reduce((sum, a) => sum + [0, 1].filter((b) => tile(x + a, y + b) === Tile.Iron).length, 0);
const mkFor = (kind: BuildingKind) => (TIERED_KINDS.includes(kind) ? game.machineTier : 1);

const rotate = (dir: number, dx: number, dy: number): [number, number] => (dir === 0 ? [dx, dy] : dir === 1 ? [-dy, dx] : dir === 2 ? [-dx, -dy] : [dy, -dx]);

/** Posição de cada peça do modelo (desenhado para leste) girado para `dir`, com a mineradora ancorada em (x, y). */
function layout(template: (typeof TEMPLATES)['raw'], x: number, y: number, dir: Dir) {
  const corner = (p: Piece) => {
    const last = BUILDING_SIZE[p.kind] - 1;
    const cells = [[0, 0], [last, 0], [0, last], [last, last]].map(([i, j]) => rotate(dir, p.dx + i, p.dy + j));
    return [Math.min(...cells.map((c) => c[0])), Math.min(...cells.map((c) => c[1]))];
  };
  const [mx, my] = corner(template.pieces[0]);
  return template.pieces.map((p) => { const [cx, cy] = corner(p); return { kind: p.kind, x: x + cx - mx, y: y + cy - my }; });
}

/** Melhor sítio livre (mais ferro sob a mineradora, mínimo 2 tiles) onde a linha inteira cabe, em qualquer das 4 direções. */
function findSite(template: (typeof TEMPLATES)['raw']): { x: number; y: number; dir: Dir } | undefined {
  let best: { x: number; y: number; dir: Dir; ore: number } | undefined;
  for (let y = 1; y < height - 2; y++) {
    for (let x = 1; x < width - 2; x++) {
      const ore = ironUnder(x, y);
      if (ore < 2 || (best && ore <= best.ore)) continue;
      for (const dir of [0, 1, 2, 3] as Dir[]) {
        if (layout(template, x, y, dir).every((p) => game.canPlace(p.kind, p.x, p.y, mkFor(p.kind)) === 'ok')) { best = { x, y, dir, ore }; break; }
      }
    }
  }
  return best;
}

const bestTemplate = () => (game.isRecipeUnlocked('gear') ? 'gear' : game.isBuildingUnlocked('furnace') ? 'plate' : 'raw');
const lineCost = (name: keyof typeof TEMPLATES) => TEMPLATES[name].pieces.reduce((sum, p) => sum + buildCost(p.kind, mkFor(p.kind)), 0);

type Placed = { kind: BuildingKind; x: number; y: number; mk: number; dir: Dir }[];

function buildLine(name: keyof typeof TEMPLATES): Placed | undefined {
  const template = TEMPLATES[name];
  const site = findSite(template);
  if (!site) return undefined;
  return construct(name, layout(template, site.x, site.y, site.dir).map((p) => ({ ...p, mk: mkFor(p.kind), dir: site.dir })));
}

function construct(name: keyof typeof TEMPLATES, placed: Placed): Placed {
  for (const piece of placed) {
    const result = game.place(piece.kind, piece.x, piece.y, piece.dir, piece.mk);
    if (result !== 'ok') throw new Error(`bot: ${piece.kind} ${result}`);
  }
  if (name === 'gear') game.setRecipe(placed[4].x, placed[4].y, 'gear');
  return placed;
}

type Name = keyof typeof TEMPLATES;
const RANK: Record<Name, number> = { raw: 0, plate: 1, gear: 2 };
const built: { name: Name; at: Placed; blocked?: boolean }[] = [];
const removeCost = (name: Name) => TEMPLATES[name].pieces.reduce((sum, p) => sum + removalCost(p.kind, mkFor(p.kind)), 0);

const nextResearch = () => RESEARCH_ORDER.find((id) => (id.startsWith('mk') ? game.machineTier < Number(id.slice(2)) : !game.researched.has(id)));
const clock = (ticks: number) => `${String(Math.floor(ticks / TPS / 3600)).padStart(3)}h${String(Math.floor((ticks / TPS / 60) % 60)).padStart(2, '0')}`;

let lines = 0;
let exhausted = false;
let lastSignature = '';
let upgrades = 0;
const log: string[] = [];
const checkpoints = new Set([1, 3, 6, 12, 24, 48, 72, 96, 120, 144, 168].map((h) => h * 3600 * TPS));
let hourMark = { tick: 0, score: 0 };
const started = Date.now();

for (let tick = 0; tick < DAYS * 24 * 3600 * TPS; tick++) {
  game.step();
  if (checkpoints.has(game.tick)) {
    const income = (game.score - hourMark.score) / ((game.tick - hourMark.tick) / TPS);
    log.push(`${clock(game.tick)}  score ${Math.floor(game.score).toLocaleString('pt-BR').padStart(13)}  renda ${income.toFixed(1).padStart(6)} pts/s  linhas ${String(lines).padStart(2)}  Mk${game.machineTier}  pesquisas ${game.researched.size}/${TECHS.length}`);
    hourMark = { tick: game.tick, score: game.score };
  }
  if (game.tick % DECIDE_EVERY !== 0) continue;

  // 1) investe em renda: mantém o número de linhas à frente das pesquisas (3 + 3 por pesquisa feita)
  const wantLines = Math.min(MAX_LINES, 3 + 3 * game.researched.size + (game.machineTier - 1));
  const name = bestTemplate();
  const signature = `${game.researched.size}|${game.unlockedZone}|${game.machineTier}|${name}`;
  if (signature !== lastSignature) {
    lastSignature = signature;
    exhausted = false; // novo modelo, nova zona ou nova versão: vale tentar de novo
  }
  while (!exhausted && lines < wantLines && game.score - lineCost(name) >= (lines < 3 ? -1200 : 0)) {
    const at = buildLine(name);
    if (!at) {
      exhausted = true;
      log.push(`${clock(game.tick)}  sem lugar para ${name} (${lines} linhas)`);
      break;
    }
    built.push({ name, at });
    lines++;
    if (lines % 5 === 0 || lines <= 3) log.push(`${clock(game.tick)}  linha ${String(lines).padStart(2)} (${name}) · score ${Math.floor(game.score).toLocaleString('pt-BR')}`);
  }
  // reforma: troca a linha mais fraca pelo melhor modelo (paga a remoção); se não couber, refaz a antiga e não tenta de novo
  const weakest = built.filter((l) => !l.blocked && RANK[l.name] < RANK[name]).sort((a, b) => RANK[a.name] - RANK[b.name])[0];
  if (weakest && (exhausted || lines >= wantLines) && game.score >= removeCost(weakest.name) + lineCost(name)) {
    for (const piece of weakest.at) game.remove(piece.x, piece.y);
    const at = buildLine(name);
    if (at) {
      built.splice(built.indexOf(weakest), 1, { name, at });
      upgrades++;
      log.push(`${clock(game.tick)}  reformou linha ${weakest.name} → ${name} · score ${Math.floor(game.score).toLocaleString('pt-BR')}`);
    } else {
      construct(weakest.name, weakest.at); // não coube: volta como era
      weakest.blocked = true;
    }
  }
  // 2) com as linhas em dia (ou sem espaço), pesquisa o que der
  if (lines >= wantLines || exhausted) {
    for (let id = nextResearch(); id; id = nextResearch()) {
      const done = id.startsWith('mk') ? game.researchTier() : game.research(id);
      if (!done) break;
      log.push(`${clock(game.tick)}  pesquisou ${id.padEnd(16)} (resta ${Math.floor(game.score).toLocaleString('pt-BR')})`);
    }
  }
}

console.log(log.join('\n'));
const mix = ['raw', 'plate', 'gear'].map((n) => `${built.filter((l) => l.name === n).length} ${n}`).join(' · ');
console.log(`\nlinhas no fim: ${mix} · reformas: ${upgrades}`);
console.log(`simulados ${DAYS} dia(s) em ${((Date.now() - started) / 1000).toFixed(1)} s · ${game.entities.length} entidades · score final ${Math.floor(game.score).toLocaleString('pt-BR')}`);

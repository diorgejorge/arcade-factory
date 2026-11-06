import { BUILDING_ORDER, BUILDING_SIZE, RECIPES } from '../engine/data';
import { Game, TICK_RATE, type PlaceResult } from '../engine/sim';
import type { BuildingKind, Dir, Entity } from '../engine/types';
import { createWorld3D } from '../client3d/world3d';
import { createCatalog } from './catalog';
import { createTechTree } from './techTree';
import { createUi, type UiState } from './ui';

const SEASON_SEED = 20261102; // no jogo real vem do servidor: uma seed por temporada
const TICK_MS = 1000 / TICK_RATE;
const MAX_STEPS_PER_FRAME = 8;

const PLACE_MESSAGES: Record<PlaceResult, string> = {
  ok: '',
  out_of_bounds: 'Fora do mapa.',
  blocked: 'Terreno bloqueado.',
  occupied: 'Já existe algo aqui.',
  locked: 'Ainda não desbloqueado: pesquise na lateral.',
  out_of_zone: 'Zona ainda bloqueada: pesquise uma Expansão.',
  needs_ore: 'A mineradora precisa ficar sobre minério.',
};

type Cell = { x: number; y: number };

const game = new Game(SEASON_SEED);
const state: UiState = { tool: null, selected: null, mk: 1 };
let toolDir: Dir = 0;
let hover: Cell | undefined;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const world = createWorld3D(canvas, game);
const tree = createTechTree(game, state);
const catalog = createCatalog(game, state, {
  pick: (kind, mk) => {
    state.tool = kind;
    state.mk = mk;
    state.selected = null;
    catalog.close();
    updateGhost();
  },
  openTree: () => {
    catalog.close();
    tree.open();
  },
});
const toggleTree = () => {
  catalog.close();
  tree.toggle();
};
const toggleCatalog = () => {
  tree.close();
  catalog.toggle();
};
const modalOpen = () => tree.isOpen() || catalog.isOpen();

const ui = createUi(game, state, {
  selectTool: (kind) => {
    state.tool = kind;
    state.selected = null;
    updateGhost();
  },
  toggleTree,
  toggleCatalog,
});

if (import.meta.env.DEV) Object.assign(window, { __game: game, __world: world, __state: state });

// ---------- construção ----------

/** Centraliza a área da construção sob o cursor (o canto superior esquerdo vira a âncora). */
const anchorFor = (kind: BuildingKind, cell: Cell): Cell => {
  const offset = Math.floor((BUILDING_SIZE[kind] - 1) / 2);
  return { x: cell.x - offset, y: cell.y - offset };
};

function updateGhost(): void {
  if (!state.tool || !hover) return world.setGhost(null);
  const anchor = anchorFor(state.tool, hover);
  world.setGhost({ kind: state.tool, ...anchor, dir: toolDir, valid: game.canPlace(state.tool, anchor.x, anchor.y, state.mk) === 'ok' });
}

function build(kind: BuildingKind, cell: Cell, dir: Dir): void {
  const { x, y } = anchorFor(kind, cell);
  const result = game.place(kind, x, y, dir, state.mk);
  if (result !== 'ok') {
    if (result !== 'occupied') ui.showHint(PLACE_MESSAGES[result]);
    return;
  }
  if (kind === 'assembler') {
    const first = Object.values(RECIPES).find((r) => r.machine === 'assembler' && game.isRecipeUnlocked(r.id));
    if (first) game.setRecipe(x, y, first.id);
    state.selected = game.entityAt(x, y) ?? null;
  }
}

/** Arrastando com a esteira: cada passo gira a anterior e aponta a nova na direção do arrasto. */
function dragConveyor(from: Cell, to: Cell): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return build('conveyor', to, toolDir);
  const dir = (dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3) as Dir;
  if (game.entityAt(from.x, from.y)?.kind === 'conveyor') game.setDir(from.x, from.y, dir);
  toolDir = dir;
  build('conveyor', to, dir);
}

/** Remove só com clique (sem arrastar), porque cada remoção custa pontos. */
function erase(cell: Cell, entity?: Entity): void {
  const removed = game.remove(entity?.x ?? cell.x, entity?.y ?? cell.y);
  if (removed) ui.showHint(`Removido: -${removed.charged} pontos.`);
  if (state.selected && !game.entities.includes(state.selected)) state.selected = null;
}

// ---------- entrada ----------

type Drag = { mode: 'build' | 'pan'; last: Cell; px: number; py: number };
let drag: Drag | null = null;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
  const { tile, entity } = world.pick(e.clientX, e.clientY);
  if (e.button === 1) {
    drag = { mode: 'pan', last: tile, px: e.clientX, py: e.clientY };
  } else if (e.button === 2) {
    erase(tile, entity);
  } else if (e.button === 0) {
    if (state.tool) {
      build(state.tool, tile, toolDir);
      drag = { mode: 'build', last: tile, px: e.clientX, py: e.clientY };
    } else {
      state.selected = entity ?? game.entityAt(tile.x, tile.y) ?? null;
    }
  }
  updateGhost();
});

window.addEventListener('mousemove', (e) => {
  const { tile } = world.pick(e.clientX, e.clientY);
  hover = tile;
  if (drag?.mode === 'pan') {
    world.panDrag(e.clientX - drag.px, e.clientY - drag.py);
    drag.px = e.clientX;
    drag.py = e.clientY;
  } else if (drag && (tile.x !== drag.last.x || tile.y !== drag.last.y)) {
    if (state.tool === 'conveyor') dragConveyor(drag.last, tile);
    else if (state.tool) build(state.tool, tile, toolDir);
    drag.last = tile;
  }
  updateGhost();
});

window.addEventListener('mouseup', () => (drag = null));
canvas.addEventListener('wheel', (e) => { e.preventDefault(); world.zoom(e.deltaY); }, { passive: false });

const heldKeys = new Set<string>();

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement) return;
  const key = e.key.toLowerCase();
  heldKeys.add(key);
  if (key === 't') return toggleTree();
  if (key === 'b') return toggleCatalog();
  if (modalOpen()) {
    if (key === 'escape') {
      tree.close();
      catalog.close();
    }
    return;
  }
  const kind = BUILDING_ORDER[Number(key) - 1];
  if (kind) {
    if (!game.isBuildingUnlocked(kind)) return ui.showHint('Ainda bloqueado: pesquise na lateral.');
    state.tool = state.tool === kind ? null : kind;
    state.selected = null;
  } else if (key === 'q' || key === 'escape') {
    state.tool = null;
    state.selected = null;
  } else if (key === 'r') {
    if (state.tool) toolDir = ((toolDir + 1) % 4) as Dir;
    else if (state.selected) game.rotate(state.selected.x, state.selected.y);
  }
  updateGhost();
});
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => heldKeys.clear());
window.addEventListener('resize', world.resize);

// ---------- loop ----------

let lastFrame = performance.now();
let accumulator = 0;

/** Avança o jogo `elapsed` ms e desenha (`draw = false` só simula, útil em testes). */
function advance(elapsed: number, draw = true): void {
  world.panKeys(heldKeys, elapsed / 1000);
  accumulator += elapsed;
  let steps = 0;
  while (accumulator >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
    game.step();
    accumulator -= TICK_MS;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
  if (!draw) return;
  world.setSelected(state.selected);
  world.render(accumulator / TICK_MS, elapsed / 1000);
}

function frame(now: number): void {
  advance(Math.min(now - lastFrame, 250));
  lastFrame = now;
  requestAnimationFrame(frame);
}

const refreshAll = () => {
  ui.refresh();
  tree.refresh();
  catalog.refresh();
};
refreshAll();
window.setInterval(refreshAll, 250);
// `?manual` (só em dev): o teste dirige o relógio, pois sem GPU o laço contínuo nunca deixa a página ociosa.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('manual')) Object.assign(window, { __advance: advance });
else requestAnimationFrame(frame);

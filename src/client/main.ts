import { BUILDING_ORDER, RECIPES } from '../engine/data';
import { Game, TICK_RATE, type PlaceResult } from '../engine/sim';
import type { BuildingKind, Dir } from '../engine/types';
import { render, type Overlay, type View } from './render';
import { renderLockedOverlay, renderTerrain, TILE } from './sprites';
import { createUi, type UiState } from './ui';

const SEASON_SEED = 20261102; // no jogo real vem do servidor: uma seed por temporada
const TICK_MS = 1000 / TICK_RATE;
const MAX_STEPS_PER_FRAME = 8;
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;

const PLACE_MESSAGES: Record<PlaceResult, string> = {
  ok: '',
  out_of_bounds: 'Fora do mapa.',
  blocked: 'Terreno bloqueado.',
  occupied: 'Já existe algo aqui.',
  locked: 'Ainda não desbloqueado: pesquise na lateral.',
  out_of_zone: 'Zona ainda bloqueada: pesquise uma Expansão.',
  needs_ore: 'A mineradora precisa ficar sobre minério.',
};

const game = new Game(SEASON_SEED);
const state: UiState = { tool: null, selected: null, speed: 1 };
const view: View = { camX: 0, camY: 0, zoom: 3 };
const overlay: Overlay = {};
let toolDir: Dir = 0;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const terrainImage = renderTerrain(game.terrain.tiles, game.terrain.width, game.terrain.height);
let shownZone = game.unlockedZone;
let lockedOverlay = renderLockedOverlay(game.terrain.zones, game.terrain.width, game.terrain.height, shownZone);
const dpr = window.devicePixelRatio || 1;

const ui = createUi(game, state, {
  selectTool: (kind) => {
    state.tool = kind;
    state.selected = null;
    updateGhost();
  },
  setSpeed: (speed) => (state.speed = speed),
});

if (import.meta.env.DEV) Object.assign(window, { __game: game, __view: view });

// ---------- câmera ----------

function resize(): void {
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
}

function centerCamera(): void {
  view.camX = (game.terrain.width * TILE) / 2 - window.innerWidth / 2 / view.zoom;
  view.camY = (game.terrain.height * TILE) / 2 - window.innerHeight / 2 / view.zoom;
}

function tileAt(clientX: number, clientY: number): { x: number; y: number } {
  return { x: Math.floor((view.camX + clientX / view.zoom) / TILE), y: Math.floor((view.camY + clientY / view.zoom) / TILE) };
}

// ---------- construção ----------

function updateGhost(): void {
  const hover = overlay.hover;
  overlay.ghost = state.tool && hover ? { kind: state.tool, dir: toolDir, valid: game.canPlace(state.tool, hover.x, hover.y) === 'ok' } : undefined;
  overlay.selected = state.selected ?? undefined;
}

function build(kind: BuildingKind, x: number, y: number, dir: Dir): void {
  const result = game.place(kind, x, y, dir);
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
function dragConveyor(from: { x: number; y: number }, to: { x: number; y: number }): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return build('conveyor', to.x, to.y, toolDir);
  const dir = (dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3) as Dir;
  if (game.entityAt(from.x, from.y)?.kind === 'conveyor') game.setDir(from.x, from.y, dir);
  toolDir = dir;
  build('conveyor', to.x, to.y, dir);
}

// ---------- entrada ----------

type Drag = { mode: 'build' | 'erase' | 'pan'; last: { x: number; y: number }; px: number; py: number };
let drag: Drag | null = null;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
  const tile = tileAt(e.clientX, e.clientY);
  if (e.button === 1) {
    drag = { mode: 'pan', last: tile, px: e.clientX, py: e.clientY };
  } else if (e.button === 2) {
    game.remove(tile.x, tile.y);
    if (state.selected && !game.entityAt(state.selected.x, state.selected.y)) state.selected = null;
    drag = { mode: 'erase', last: tile, px: e.clientX, py: e.clientY };
  } else if (e.button === 0) {
    if (state.tool) {
      build(state.tool, tile.x, tile.y, toolDir);
      drag = { mode: 'build', last: tile, px: e.clientX, py: e.clientY };
    } else {
      state.selected = game.entityAt(tile.x, tile.y) ?? null;
    }
  }
  updateGhost();
});

window.addEventListener('mousemove', (e) => {
  const tile = tileAt(e.clientX, e.clientY);
  overlay.hover = tile;
  if (drag?.mode === 'pan') {
    view.camX -= (e.clientX - drag.px) / view.zoom;
    view.camY -= (e.clientY - drag.py) / view.zoom;
    drag.px = e.clientX;
    drag.py = e.clientY;
  } else if (drag && (tile.x !== drag.last.x || tile.y !== drag.last.y)) {
    if (drag.mode === 'erase') game.remove(tile.x, tile.y);
    else if (state.tool === 'conveyor') dragConveyor(drag.last, tile);
    else if (state.tool) build(state.tool, tile.x, tile.y, toolDir);
    drag.last = tile;
  }
  updateGhost();
});

window.addEventListener('mouseup', () => (drag = null));

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const worldX = view.camX + e.clientX / view.zoom;
    const worldY = view.camY + e.clientY / view.zoom;
    view.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    view.camX = worldX - e.clientX / view.zoom;
    view.camY = worldY - e.clientY / view.zoom;
  },
  { passive: false },
);

const heldKeys = new Set<string>();
const PAN_KEYS: Record<string, [number, number]> = {
  w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0],
};

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement) return;
  const key = e.key.toLowerCase();
  heldKeys.add(key);
  const index = Number(key) - 1;
  if (BUILDING_ORDER[index]) {
    const kind = BUILDING_ORDER[index];
    if (!game.isBuildingUnlocked(kind)) return ui.showHint('Ainda bloqueado: pesquise na lateral.');
    state.tool = state.tool === kind ? null : kind;
    state.selected = null;
  } else if (key === 'q' || key === 'escape') {
    state.tool = null;
    state.selected = null;
  } else if (key === 'r') {
    if (state.tool) toolDir = ((toolDir + 1) % 4) as Dir;
    else if (state.selected) game.rotate(state.selected.x, state.selected.y);
  } else if (key === ' ') {
    state.speed = state.speed === 0 ? 1 : 0;
    e.preventDefault();
  }
  updateGhost();
});
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => heldKeys.clear());
window.addEventListener('resize', resize);

// ---------- loop ----------

let lastFrame = performance.now();
let accumulator = 0;

function frame(now: number): void {
  const elapsed = Math.min(now - lastFrame, 250);
  lastFrame = now;

  const panSpeed = (420 * elapsed) / 1000 / view.zoom;
  for (const key of heldKeys) {
    const pan = PAN_KEYS[key];
    if (pan) {
      view.camX += pan[0] * panSpeed;
      view.camY += pan[1] * panSpeed;
    }
  }

  accumulator += elapsed * state.speed;
  let steps = 0;
  while (accumulator >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
    game.step();
    accumulator -= TICK_MS;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

  if (game.unlockedZone !== shownZone) {
    shownZone = game.unlockedZone;
    lockedOverlay = renderLockedOverlay(game.terrain.zones, game.terrain.width, game.terrain.height, shownZone);
  }
  render(ctx, game, terrainImage, lockedOverlay, view, overlay, state.speed === 0 ? 1 : accumulator / TICK_MS, dpr);
  requestAnimationFrame(frame);
}

resize();
centerCamera();
ui.refresh();
window.setInterval(ui.refresh, 250);
requestAnimationFrame(frame);

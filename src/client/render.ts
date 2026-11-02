import { BELT_SPEED } from '../engine/machines';
import type { Game } from '../engine/sim';
import type { BuildingKind, Dir, Entity } from '../engine/types';
import { buildingSprites, ITEM_COLOR, TILE } from './sprites';

export interface View {
  /** Canto superior esquerdo da tela, em pixels de mundo. */
  camX: number;
  camY: number;
  zoom: number;
}

export interface Overlay {
  hover?: { x: number; y: number };
  ghost?: { kind: BuildingKind; dir: Dir; valid: boolean };
  selected?: Entity;
}

const HALF = TILE / 2;

function drawConveyor(ctx: CanvasRenderingContext2D, entity: Entity, anim: number): void {
  ctx.save();
  ctx.translate(entity.x * TILE + HALF, entity.y * TILE + HALF);
  ctx.rotate((entity.dir * Math.PI) / 2);
  ctx.fillStyle = '#2a2f3a';
  ctx.fillRect(-HALF, -6, TILE, 12);
  ctx.fillStyle = '#14161c';
  ctx.fillRect(-HALF, -6, TILE, 1);
  ctx.fillRect(-HALF, 5, TILE, 1);
  ctx.fillStyle = '#6a7384';
  for (let x = -HALF + (anim % 8); x < HALF; x += 8) ctx.fillRect(Math.floor(x), -2, 2, 4);
  ctx.restore();
}

function drawMachine(ctx: CanvasRenderingContext2D, entity: Entity, tick: number): void {
  const px = entity.x * TILE;
  const py = entity.y * TILE;
  const shake = entity.kind === 'miner' && entity.outCount === 0 ? (tick >> 2) % 2 : 0;
  ctx.drawImage(buildingSprites[entity.kind as keyof typeof buildingSprites], px + shake, py);

  if (entity.crafting) {
    ctx.fillStyle = entity.kind === 'furnace' ? ((tick >> 2) % 2 ? '#ffd24a' : '#ff7a1a') : (tick >> 3) % 2 ? '#7dffb0' : '#1f6b44';
    ctx.fillRect(px + 6, py + 6, 4, 4);
  }
  if (entity.kind !== 'hub') {
    ctx.save();
    ctx.translate(px + HALF, py + HALF);
    ctx.rotate((entity.dir * Math.PI) / 2);
    ctx.fillStyle = '#f5b942';
    ctx.fillRect(HALF - 3, -2, 3, 4);
    ctx.restore();
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, overlay: Overlay): void {
  const { hover, ghost } = overlay;
  if (!hover || !ghost) return;
  ctx.save();
  ctx.globalAlpha = 0.6;
  if (ghost.kind === 'conveyor') {
    drawConveyor(ctx, { x: hover.x, y: hover.y, dir: ghost.dir } as Entity, 0);
  } else {
    ctx.drawImage(buildingSprites[ghost.kind], hover.x * TILE, hover.y * TILE);
  }
  if (!ghost.valid) {
    ctx.fillStyle = '#ff4d4d88';
    ctx.fillRect(hover.x * TILE, hover.y * TILE, TILE, TILE);
  }
  ctx.restore();
}

function strokeTile(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
}

export function render(
  ctx: CanvasRenderingContext2D,
  game: Game,
  terrain: HTMLCanvasElement,
  view: View,
  overlay: Overlay,
  alpha: number,
  dpr: number,
): void {
  const { width, height } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0c0e12';
  ctx.fillRect(0, 0, width, height);
  const scale = view.zoom * dpr;
  ctx.setTransform(scale, 0, 0, scale, -view.camX * scale, -view.camY * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrain, 0, 0);

  const anim = (game.tick + alpha) * BELT_SPEED * TILE;
  const minX = view.camX - TILE;
  const minY = view.camY - TILE;
  const maxX = view.camX + width / scale;
  const maxY = view.camY + height / scale;
  const visible = game.entities.filter((e) => e.x * TILE >= minX && e.x * TILE <= maxX && e.y * TILE >= minY && e.y * TILE <= maxY);

  for (const entity of visible) if (entity.kind === 'conveyor') drawConveyor(ctx, entity, anim);
  for (const entity of visible) if (entity.kind !== 'conveyor') drawMachine(ctx, entity, game.tick);

  for (const entity of visible) {
    for (const item of entity.belt) {
      const x = (item.pwx + (item.wx - item.pwx) * alpha) * TILE;
      const y = (item.pwy + (item.wy - item.pwy) * alpha) * TILE;
      ctx.fillStyle = '#14161c';
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = ITEM_COLOR[item.kind];
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  drawGhost(ctx, overlay);
  if (overlay.hover && !overlay.ghost) strokeTile(ctx, overlay.hover.x, overlay.hover.y, '#ffffff66');
  if (overlay.selected) strokeTile(ctx, overlay.selected.x, overlay.selected.y, '#f5b942');
}

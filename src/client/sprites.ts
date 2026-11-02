import type { BuildingKind } from '../engine/types';
import { Tile, VOID_ZONE } from '../engine/world';

export const TILE = 16;
const PX = TILE / 8; // sprites 8x8 desenhados em tiles de 16px

const PALETTE: Record<string, string> = {
  k: '#14161c', o: '#c77d2e', l: '#e8a04a', d: '#3a2a14',
  s: '#8a8f98', b: '#3b3f47', f: '#ff7a1a',
  p: '#3b6fb6', w: '#9db8e0', g: '#e6eefc',
  G: '#2f8f4e', h: '#8fe0a8', y: '#f5d442',
};

const SPRITE_ROWS: Record<Exclude<BuildingKind, 'conveyor'>, string[]> = {
  miner: ['.kkkkkk.', 'kooooook', 'kollllok', 'kolddlok', 'kolddlok', 'kollllok', 'kooooook', '.kkkkkk.'],
  furnace: ['kkkkkkkk', 'kssssssk', 'ksbbbbsk', 'ksbffbsk', 'ksbffbsk', 'ksbbbbsk', 'kssssssk', 'kkkkkkkk'],
  assembler: ['kkkkkkkk', 'kppppppk', 'kpwwwwpk', 'kpwggwpk', 'kpwggwpk', 'kpwwwwpk', 'kppppppk', 'kkkkkkkk'],
  hub: ['kkkkkkkk', 'kGGGGGGk', 'kGhhhhGk', 'kGhyyhGk', 'kGhyyhGk', 'kGhhhhGk', 'kGGGGGGk', 'kkkkkkkk'],
  junction: ['..kssk..', '..ksbk..', 'kksbbskk', 'ksbbbbsk', 'ksbbbbsk', 'kksbbskk', '..ksbk..', '..kssk..'],
  router: ['..kllk..', '..kolk..', 'kkloolkk', 'kloyyolk', 'kloyyolk', 'kkloolkk', '..kolk..', '..kllk..'],
};

export const ITEM_COLOR = {
  iron_ore: '#7e8a99', copper_ore: '#c8743c', iron_plate: '#c9d3df', copper_plate: '#f0a066',
  gear: '#8f98a8', wire: '#e8b04a', circuit: '#4cc38a', motor: '#e5586e',
} as const;

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return [canvas, canvas.getContext('2d')!];
}

function drawRows(ctx: CanvasRenderingContext2D, rows: string[], scale: number): void {
  rows.forEach((row, y) =>
    [...row].forEach((char, x) => {
      const color = PALETTE[char];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }),
  );
}

export const buildingSprites = Object.fromEntries(
  (Object.entries(SPRITE_ROWS) as [keyof typeof SPRITE_ROWS, string[]][]).map(([kind, rows]) => {
    const [canvas, ctx] = makeCanvas(TILE);
    drawRows(ctx, rows, PX);
    return [kind, canvas];
  }),
) as Record<keyof typeof SPRITE_ROWS, HTMLCanvasElement>;

/** Hash barato e determinístico para variar o visual de cada tile sem estado. */
const hash = (x: number, y: number, salt: number): number => {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2246822519, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const GROUND_COLORS = ['#26352a', '#293a2d', '#243227'];
const ORE_COLORS: Record<number, string[]> = { [Tile.Iron]: ['#7e8a99', '#aab4c2'], [Tile.Copper]: ['#c8743c', '#f0a066'] };

/** Pré-renderiza o mapa inteiro uma única vez. */
export function renderTerrain(tiles: Uint8Array, width: number, height: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(1);
  canvas.width = width * TILE;
  canvas.height = height * TILE;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y * width + x];
      const px = x * TILE;
      const py = y * TILE;
      if (tile === Tile.Void) {
        ctx.fillStyle = '#0c0e12';
        ctx.fillRect(px, py, TILE, TILE);
        continue;
      }
      ctx.fillStyle = GROUND_COLORS[Math.floor(hash(x, y, 1) * GROUND_COLORS.length)];
      ctx.fillRect(px, py, TILE, TILE);
      if (tile === Tile.Rock) {
        ctx.fillStyle = '#4a4f59';
        ctx.fillRect(px + 1, py + 2, 14, 13);
        ctx.fillStyle = '#6a707c';
        ctx.fillRect(px + 2, py + 3, 8, 4);
        ctx.fillStyle = '#383c45';
        ctx.fillRect(px + 1, py + 12, 14, 3);
      } else if (tile === Tile.Tree) {
        ctx.fillStyle = '#1f3a22';
        ctx.fillRect(px + 2, py + 2, 12, 12);
        ctx.fillStyle = '#2f5a35';
        ctx.fillRect(px + 3, py + 3, 8, 7);
        ctx.fillStyle = '#4a3320';
        ctx.fillRect(px + 7, py + 12, 2, 3);
      } else if (tile !== Tile.Ground) {
        const colors = ORE_COLORS[tile];
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = colors[hash(x, y, i + 10) < 0.5 ? 0 : 1];
          ctx.fillRect(px + 1 + Math.floor(hash(x, y, i + 20) * 12), py + 1 + Math.floor(hash(x, y, i + 30) * 12), 3, 3);
        }
      }
    }
  }
  return canvas;
}

/** Escurece as zonas da ilha que ainda não foram liberadas por pesquisa. */
export function renderLockedOverlay(zones: Uint8Array, width: number, height: number, unlockedZone: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width * TILE;
  canvas.height = height * TILE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#05070acc';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const zone = zones[y * width + x];
      if (zone > unlockedZone && zone !== VOID_ZONE) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }
  return canvas;
}

/** Ícone do botão da barra de ferramentas. */
export function iconFor(kind: BuildingKind): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(TILE);
  if (kind === 'conveyor') {
    ctx.fillStyle = '#2a2f3a';
    ctx.fillRect(0, 2, TILE, 12);
    ctx.fillStyle = '#f5b942';
    ctx.fillRect(4, 7, 8, 2);
    ctx.fillRect(10, 5, 2, 6);
  } else {
    ctx.drawImage(buildingSprites[kind], 0, 0);
  }
  return canvas;
}

import type { BuildingKind } from '../engine/types';

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

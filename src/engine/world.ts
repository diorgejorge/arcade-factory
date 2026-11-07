import { createRng } from './rng';

export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 30;

export const Tile = { Ground: 0, Iron: 1, Copper: 2, Rock: 3, Tree: 4, Void: 5 } as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

/** Zona 0 é a área inicial; cada pesquisa de expansão libera a zona seguinte. */
export const ZONE_LIMITS = [0.5, 0.68, 0.84, 1] as const;
export const MAX_ZONE = ZONE_LIMITS.length - 1;
export const VOID_ZONE = 255;

export interface Terrain {
  width: number;
  height: number;
  tiles: Uint8Array;
  zones: Uint8Array;
}

type Rng = () => number;

export const isBuildableTile = (tile: number): boolean => tile === Tile.Ground || tile === Tile.Iron || tile === Tile.Copper;

function paintBlob(terrain: Terrain, rng: Rng, cx: number, cy: number, radius: number, tile: TileId, onlyOnGround: boolean): void {
  const { width, height, tiles } = terrain;
  const reach = Math.ceil(radius);
  for (let y = Math.max(0, Math.floor(cy) - reach); y <= Math.min(height - 1, Math.floor(cy) + reach); y++) {
    for (let x = Math.max(0, Math.floor(cx) - reach); x <= Math.min(width - 1, Math.floor(cx) + reach); x++) {
      const index = y * width + x;
      const current = tiles[index];
      if (current === Tile.Void) continue;
      const jitter = 0.65 + rng() * 0.35;
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius * jitter) continue;
      if (onlyOnGround && current !== Tile.Ground) continue;
      tiles[index] = tile;
    }
  }
}

/** Gera a ilha da temporada: mesma seed, mesma ilha para todos. */
export function generateTerrain(seed: number): Terrain {
  const rng = createRng(seed);
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const terrain: Terrain = { width, height, tiles: new Uint8Array(width * height), zones: new Uint8Array(width * height) };
  const cx = width / 2;
  const cy = height / 2;
  const between = (min: number, max: number) => min + rng() * (max - min);
  const phaseA = rng() * 6.28;
  const phaseB = rng() * 6.28;

  // Contorno irregular da ilha e divisão em zonas concêntricas.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x + 0.5 - cx) / (width / 2);
      const dy = (y + 0.5 - cy) / (height / 2);
      const angle = Math.atan2(dy, dx);
      const wobble = 0.045 * Math.sin(angle * 3 + phaseA) + 0.035 * Math.sin(angle * 5 + phaseB);
      const distance = Math.hypot(dx, dy) + wobble;
      const index = y * width + x;
      if (distance >= 1) {
        terrain.tiles[index] = Tile.Void;
        terrain.zones[index] = VOID_ZONE;
      } else {
        terrain.zones[index] = ZONE_LIMITS.findIndex((limit) => distance < limit);
      }
    }
  }

  // Ferro e cobre garantidos na zona inicial; manchas extras nas zonas de fora.
  paintBlob(terrain, rng, cx - 7 + between(-1, 1), cy + between(-3, 3), 3.4, Tile.Iron, false);
  paintBlob(terrain, rng, cx + 7 + between(-1, 1), cy + between(-3, 3), 3.2, Tile.Copper, false);
  for (let i = 0; i < 8; i++) {
    const angle = between(0, 6.28);
    const reach = between(0.45, 0.85);
    paintBlob(terrain, rng, cx + Math.cos(angle) * reach * (width / 2), cy + Math.sin(angle) * reach * (height / 2), between(2.2, 3.6), i % 2 ? Tile.Copper : Tile.Iron, false);
  }

  // Obstáculos: pedras espalhadas (inclusive na zona inicial) e bosques mais afastados.
  for (let i = 0; i < 9; i++) {
    const x = between(3, width - 3);
    const y = between(3, height - 3);
    if (Math.hypot(x - cx, y - cy) < 5) continue;
    paintBlob(terrain, rng, x, y, between(1.2, 2.4), Tile.Rock, true);
  }
  for (let i = 0; i < 10; i++) {
    const x = between(3, width - 3);
    const y = between(3, height - 3);
    if (Math.hypot((x - cx) / (width / 2), (y - cy) / (height / 2)) < 0.4) continue;
    paintBlob(terrain, rng, x, y, between(1.4, 2.8), Tile.Tree, true);
  }
  return terrain;
}

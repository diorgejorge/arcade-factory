import { createRng } from './rng';

export const MAP_SIZE = 96;

export const Tile = { Ground: 0, Iron: 1, Copper: 2, Rock: 3 } as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

export interface Terrain {
  width: number;
  height: number;
  tiles: Uint8Array;
}

type Rng = () => number;

function paintBlob(terrain: Terrain, rng: Rng, cx: number, cy: number, radius: number, tile: TileId, onlyOnGround: boolean): void {
  const { width, height, tiles } = terrain;
  const reach = Math.ceil(radius);
  for (let y = Math.max(0, Math.floor(cy) - reach); y <= Math.min(height - 1, Math.floor(cy) + reach); y++) {
    for (let x = Math.max(0, Math.floor(cx) - reach); x <= Math.min(width - 1, Math.floor(cx) + reach); x++) {
      const distSq = (x - cx) ** 2 + (y - cy) ** 2;
      const jitter = 0.65 + rng() * 0.35;
      if (distSq > radius * radius * jitter) continue;
      if (onlyOnGround && tiles[y * width + x] !== Tile.Ground) continue;
      tiles[y * width + x] = tile;
    }
  }
}

/** Gera o mapa da temporada: mesma seed, mesmo mapa para todos. */
export function generateTerrain(seed: number): Terrain {
  const rng = createRng(seed);
  const terrain: Terrain = { width: MAP_SIZE, height: MAP_SIZE, tiles: new Uint8Array(MAP_SIZE * MAP_SIZE) };
  const center = MAP_SIZE / 2;
  const between = (min: number, max: number) => min + rng() * (max - min);

  // Garante ferro e cobre perto do ponto inicial.
  paintBlob(terrain, rng, center - 11 + between(-2, 2), center + between(-3, 3), 4, Tile.Iron, false);
  paintBlob(terrain, rng, center + 11 + between(-2, 2), center + between(-3, 3), 4, Tile.Copper, false);

  for (let i = 0; i < 14; i++) {
    const tile = i % 2 === 0 ? Tile.Iron : Tile.Copper;
    paintBlob(terrain, rng, between(6, MAP_SIZE - 6), between(6, MAP_SIZE - 6), between(3, 6), tile, false);
  }
  for (let i = 0; i < 18; i++) {
    const x = between(3, MAP_SIZE - 3);
    const y = between(3, MAP_SIZE - 3);
    if (Math.hypot(x - center, y - center) < 16) continue; // área inicial livre
    paintBlob(terrain, rng, x, y, between(2, 5), Tile.Rock, true);
  }
  return terrain;
}

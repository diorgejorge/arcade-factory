import { describe, expect, it } from 'vitest';
import { ITEM_VALUE, REMOVAL_COST } from './data';
import { offerItem } from './machines';
import { Game } from './sim';
import { isBuildableTile, Tile, VOID_ZONE } from './world';

const SEED = 2026;

const tileAt = (game: Game, x: number, y: number) => game.terrain.tiles[y * game.terrain.width + x];

function countTiles(game: Game, x: number, y: number, size: number, tile: number): number {
  let count = 0;
  for (let cy = y; cy < y + size; cy++) for (let cx = x; cx < x + size; cx++) if (tileAt(game, cx, cy) === tile) count++;
  return count;
}

/** Procura um retângulo w×h livre na área liberada, que também satisfaça `accept`. */
function findSite(game: Game, w: number, h: number, accept: (x: number, y: number) => boolean = () => true): { x: number; y: number } {
  const { width, height, zones } = game.terrain;
  for (let y = 0; y + h <= height; y++) {
    for (let x = 0; x + w <= width; x++) {
      let free = true;
      for (let cy = y; cy < y + h && free; cy++) {
        for (let cx = x; cx < x + w && free; cx++) free = isBuildableTile(tileAt(game, cx, cy)) && zones[cy * width + cx] <= game.unlockedZone;
      }
      if (free && accept(x, y)) return { x, y };
    }
  }
  throw new Error(`no ${w}x${h} site found`);
}

const pureOre = (game: Game, tile: number, wanted: number) => (x: number, y: number) =>
  countTiles(game, x, y, 2, tile) === wanted && countTiles(game, x, y, 2, tile === Tile.Iron ? Tile.Copper : Tile.Iron) === 0;

function runTicks(game: Game, ticks: number): void {
  for (let i = 0; i < ticks; i++) game.step();
}

function research(game: Game, ...techs: string[]): void {
  for (const tech of techs) {
    game.inventory.iron_ore += 100; game.inventory.iron_plate += 200; game.inventory.gear += 100;
    game.inventory.copper_plate += 100; game.inventory.circuit += 100;
    expect(game.research(tech), tech).toBe(true);
  }
}

describe('valores', () => {
  it('itens complexos valem mais', () => {
    expect(ITEM_VALUE.iron_ore).toBe(1);
    expect(ITEM_VALUE.iron_plate).toBe(2);
    expect(ITEM_VALUE.gear).toBe(8);
    expect(ITEM_VALUE.circuit).toBe(16);
    expect(ITEM_VALUE.motor).toBe(64);
  });
});

describe('ilha', () => {
  it('é determinística por seed', () => {
    expect(new Game(SEED).terrain.tiles).toEqual(new Game(SEED).terrain.tiles);
    expect(new Game(SEED).terrain.tiles).not.toEqual(new Game(SEED + 1).terrain.tiles);
  });

  it('tem vazio ao redor, zonas e ferro e cobre na zona inicial', () => {
    const { tiles, zones, width, height } = new Game(SEED).terrain;
    expect(tiles.filter((t) => t === Tile.Void).length).toBeGreaterThan(0);
    const startZone = Array.from({ length: width * height }, (_, i) => i).filter((i) => zones[i] === 0);
    expect(startZone.some((i) => tiles[i] === Tile.Iron)).toBe(true);
    expect(startZone.some((i) => tiles[i] === Tile.Copper)).toBe(true);
    expect(new Set(zones)).toEqual(new Set([0, 1, 2, 3, VOID_ZONE]));
  });
});

describe('construção', () => {
  it('ocupa todas as células e remove pelo conjunto', () => {
    const game = new Game(SEED);
    const { x, y } = findSite(game, 2, 2, pureOre(game, Tile.Iron, 4));
    expect(game.place('miner', x, y, 0)).toBe('ok');
    const miner = game.entityAt(x, y)!;
    expect([game.entityAt(x + 1, y), game.entityAt(x, y + 1), game.entityAt(x + 1, y + 1)]).toEqual([miner, miner, miner]);
    expect(game.place('conveyor', x + 1, y + 1, 0)).toBe('occupied');
    expect(game.remove(x + 1, y + 1)?.kind).toBe('miner');
    expect(game.entityAt(x, y)).toBeUndefined();
    expect(game.place('conveyor', x + 1, y + 1, 0)).toBe('ok');
  });

  it('respeita minério, vazio, limites e bloqueios', () => {
    const game = new Game(SEED);
    const { x, y } = findSite(game, 2, 2, (sx, sy) => countTiles(game, sx, sy, 2, Tile.Iron) + countTiles(game, sx, sy, 2, Tile.Copper) === 0);
    expect(game.place('miner', x, y, 0)).toBe('needs_ore');
    expect(game.place('furnace', x, y, 0)).toBe('locked');
    expect(game.place('conveyor', -1, 0, 0)).toBe('out_of_bounds');
    expect(game.place('conveyor', 0, 0, 0)).toBe('blocked'); // canto da ilha é vazio
  });

  it('só libera zonas de fora depois da expansão', () => {
    const game = new Game(SEED);
    const { zones, width, height } = game.terrain;
    const outer = Array.from({ length: width * height }, (_, i) => i).find((i) => zones[i] === 1 && isBuildableTile(game.terrain.tiles[i]))!;
    const [ox, oy] = [outer % width, Math.floor(outer / width)];
    expect(game.place('conveyor', ox, oy, 0)).toBe('out_of_zone');
    research(game, 'smelting', 'assembly', 'land_1');
    expect(game.unlockedZone).toBe(1);
    expect(game.place('conveyor', ox, oy, 0)).toBe('ok');
  });
});

describe('remoção', () => {
  it('custa pontos por tipo de construção e o placar nunca fica negativo', () => {
    const game = new Game(SEED);
    const { x, y } = findSite(game, 4, 2, pureOre(game, Tile.Iron, 4));
    game.place('conveyor', x + 2, y, 0);
    game.place('miner', x, y, 0);
    game.score = 500;
    expect(game.remove(x + 2, y)).toEqual({ kind: 'conveyor', charged: REMOVAL_COST.conveyor });
    expect(game.score).toBe(500 - REMOVAL_COST.conveyor);
    expect(game.remove(x, y)).toEqual({ kind: 'miner', charged: REMOVAL_COST.miner });
    expect(game.score).toBe(500 - REMOVAL_COST.conveyor - REMOVAL_COST.miner);
    game.place('miner', x, y, 0);
    game.score = 7;
    expect(game.remove(x, y)).toEqual({ kind: 'miner', charged: 7 }); // cobra só o que há
    expect(game.score).toBe(0);
    expect(game.remove(x, y)).toBeUndefined(); // nada a remover, nada a cobrar
  });
});

describe('produção', () => {
  it('a mineradora rende por tile de minério embaixo dela', () => {
    const deliveredIn600Ticks = (oreTiles: number) => {
      const game = new Game(SEED);
      const { x, y } = findSite(game, 4, 2, pureOre(game, Tile.Iron, oreTiles));
      game.place('miner', x, y, 0);
      game.place('hub', x + 2, y, 0);
      runTicks(game, 600);
      return game.inventory.iron_ore;
    };
    const rich = deliveredIn600Ticks(4);
    const poor = deliveredIn600Ticks(1);
    expect(poor).toBeGreaterThan(3);
    expect(rich).toBeGreaterThan(poor * 3);
  });

  it('minério chega na central por esteira e pontua', () => {
    const game = new Game(SEED);
    const { x, y } = findSite(game, 5, 2, pureOre(game, Tile.Iron, 4));
    game.place('miner', x, y, 0);
    game.place('conveyor', x + 2, y, 0);
    game.place('conveyor', x + 3, y, 0);
    game.place('hub', x + 4, y, 0);
    runTicks(game, 400);
    expect(game.inventory.iron_ore).toBeGreaterThan(5);
    expect(game.score).toBe(game.inventory.iron_ore);
  });

  it('fornalha transforma minério em placa e vale mais', () => {
    const game = new Game(SEED);
    research(game, 'smelting');
    game.inventory.iron_ore = 0; game.inventory.iron_plate = 0; game.inventory.gear = 0; game.inventory.copper_plate = 0; game.inventory.circuit = 0;
    const { x, y } = findSite(game, 6, 2, pureOre(game, Tile.Iron, 4));
    game.place('miner', x, y, 0);
    game.place('furnace', x + 2, y, 0);
    game.place('hub', x + 4, y, 0);
    runTicks(game, 800);
    expect(game.inventory.iron_plate).toBeGreaterThan(3);
    expect(game.inventory.iron_ore).toBe(0);
    expect(game.score).toBe(game.inventory.iron_plate * ITEM_VALUE.iron_plate);
  });

  it('é determinístico', () => {
    const run = () => {
      const game = new Game(SEED);
      const { x, y } = findSite(game, 4, 2, pureOre(game, Tile.Iron, 4));
      game.place('miner', x, y, 0);
      game.place('hub', x + 2, y, 0);
      runTicks(game, 300);
      return game.score;
    };
    expect(run()).toBe(run());
  });
});

describe('logística', () => {
  it('junção leva cada item em linha reta, permitindo cruzar esteiras', () => {
    const game = new Game(SEED);
    research(game, 'smelting', 'logistics');
    const { x: ax, y: ay } = findSite(game, 4, 3);
    const [jx, jy] = [ax + 1, ay];
    expect(game.place('junction', jx, jy, 0)).toBe('ok');
    expect(game.place('hub', jx + 1, jy, 0)).toBe('ok'); // à leste
    const junction = game.entityAt(jx, jy)!;
    const east = game.entityAt(jx + 1, jy)!;
    offerItem(game, junction, 'iron_ore', 0, { x: jx, y: jy }); // vindo do oeste
    offerItem(game, junction, 'copper_ore', 1, { x: jx, y: jy }); // vindo do norte
    runTicks(game, 60);
    expect(east.inputs).toEqual({ iron_ore: 1 }); // só o item do oeste chegou; o do norte segue para o sul
    expect(game.place('hub', jx - 1, jy + 1, 0)).toBe('ok'); // agora há saída ao sul
    runTicks(game, 60);
    expect(game.entityAt(jx, jy + 1)!.inputs).toEqual({ copper_ore: 1 });
    expect(east.inputs).toEqual({ iron_ore: 1 });
  });

  it('roteador reparte em revezamento e nunca devolve à origem', () => {
    const game = new Game(SEED);
    research(game, 'smelting', 'logistics');
    const { x: ax, y: ay } = findSite(game, 4, 4);
    const [rx, ry] = [ax + 1, ay + 2];
    game.place('router', rx, ry, 0);
    game.place('hub', rx + 1, ry, 0); // leste
    game.place('hub', rx - 1, ry - 2, 0); // norte
    const router = game.entityAt(rx, ry)!;
    for (let i = 0; i < 4; i++) {
      expect(offerItem(game, router, 'iron_ore', 0, { x: rx, y: ry })).toBe(true);
      runTicks(game, 5);
    }
    expect(game.entityAt(rx + 1, ry)!.inputs).toEqual({ iron_ore: 2 });
    expect(game.entityAt(rx, ry - 1)!.inputs).toEqual({ iron_ore: 2 });
  });
});

describe('pesquisa', () => {
  it('respeita pré-requisitos e custo', () => {
    const game = new Game(SEED);
    game.inventory.iron_plate = 40;
    expect(game.research('assembly')).toBe(false); // falta fundição
    expect(game.research('smelting')).toBe(false); // falta minério
    game.inventory.iron_ore = 30;
    expect(game.research('smelting')).toBe(true);
    expect(game.inventory.iron_ore).toBe(0);
    expect(game.isBuildingUnlocked('furnace')).toBe(true);
    expect(game.research('smelting')).toBe(false); // já pesquisada
    expect(game.research('assembly')).toBe(true);
  });

  it('montadora só aceita receitas desbloqueadas', () => {
    const game = new Game(SEED);
    research(game, 'smelting', 'assembly');
    const { x, y } = findSite(game, 3, 3);
    game.place('assembler', x, y, 0);
    expect(game.setRecipe(x, y, 'circuit')).toBe(false);
    expect(game.setRecipe(x + 2, y + 2, 'gear')).toBe(true); // qualquer célula da máquina serve
  });
});

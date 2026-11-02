import { describe, expect, it } from 'vitest';
import { ITEM_VALUE } from './data';
import { Game } from './sim';
import { Tile } from './world';

const SEED = 2026;

/** Procura um minério com `length` tiles livres (sem pedra) logo a leste. */
function findRun(game: Game, ore: number, length: number): { x: number; y: number } {
  const { width, height, tiles } = game.terrain;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x + length < width; x++) {
      if (tiles[y * width + x] !== ore) continue;
      let clear = true;
      for (let i = 1; i <= length; i++) clear &&= tiles[y * width + x + i] !== Tile.Rock;
      if (clear) return { x, y };
    }
  }
  throw new Error('no run found');
}

function runTicks(game: Game, ticks: number): void {
  for (let i = 0; i < ticks; i++) game.step();
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

describe('mapa', () => {
  it('é determinístico por seed', () => {
    expect(new Game(SEED).terrain.tiles).toEqual(new Game(SEED).terrain.tiles);
    expect(new Game(SEED).terrain.tiles).not.toEqual(new Game(SEED + 1).terrain.tiles);
  });
});

describe('construção', () => {
  it('exige minério para a mineradora e respeita bloqueios', () => {
    const game = new Game(SEED);
    expect(game.place('miner', 0, 0, 0)).not.toBe('ok');
    const { x, y } = findRun(game, Tile.Iron, 1);
    expect(game.place('miner', x, y, 0)).toBe('ok');
    expect(game.place('conveyor', x, y, 0)).toBe('occupied');
    expect(game.place('furnace', x + 1, y, 0)).toBe('locked');
    expect(game.place('conveyor', -1, 0, 0)).toBe('out_of_bounds');
  });
});

describe('produção', () => {
  it('minério chega na central e pontua', () => {
    const game = new Game(SEED);
    const { x, y } = findRun(game, Tile.Iron, 3);
    game.place('miner', x, y, 0);
    game.place('conveyor', x + 1, y, 0);
    game.place('conveyor', x + 2, y, 0);
    game.place('hub', x + 3, y, 0);
    runTicks(game, 400);
    expect(game.inventory.iron_ore).toBeGreaterThan(5);
    expect(game.score).toBe(game.inventory.iron_ore);
  });

  it('é determinístico', () => {
    const build = () => {
      const game = new Game(SEED);
      const { x, y } = findRun(game, Tile.Iron, 2);
      game.place('miner', x, y, 0);
      game.place('conveyor', x + 1, y, 0);
      game.place('hub', x + 2, y, 0);
      runTicks(game, 300);
      return game.score;
    };
    expect(build()).toBe(build());
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

  it('fornalha transforma minério em placa e vale mais', () => {
    const game = new Game(SEED);
    game.inventory.iron_ore = 30;
    game.research('smelting');
    const { x, y } = findRun(game, Tile.Iron, 2);
    game.place('miner', x, y, 0);
    game.place('furnace', x + 1, y, 0);
    game.place('hub', x + 2, y, 0);
    runTicks(game, 600);
    expect(game.inventory.iron_plate).toBeGreaterThan(3);
    expect(game.score).toBe(game.inventory.iron_plate * ITEM_VALUE.iron_plate);
  });

  it('montadora só aceita receitas desbloqueadas', () => {
    const game = new Game(SEED);
    game.inventory.iron_ore = 30;
    game.research('smelting');
    game.inventory.iron_plate = 40;
    game.research('assembly');
    const { x, y } = findRun(game, Tile.Iron, 2);
    game.place('assembler', x + 1, y, 0);
    expect(game.setRecipe(x + 1, y, 'circuit')).toBe(false);
    expect(game.setRecipe(x + 1, y, 'gear')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { BUILD_COST, buildCost, ITEM_VALUE, MAX_TIER, removalCost, TECHS, tierBoost, tierCost } from './data';
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

/** Pesquisa as tecnologias dadas sem alterar o placar do teste (dá saldo só no momento de pesquisar). */
function research(game: Game, ...techs: string[]): void {
  const before = game.score;
  for (const tech of techs) {
    game.score = 1e9;
    expect(game.research(tech), tech).toBe(true);
  }
  game.score = before;
}

/** Pesquisa o que cada versão de máquina exige e depois a própria versão, sem alterar o placar do teste. */
const TIER_TECHS: Record<number, string[]> = { 2: ['smelting', 'assembly'], 3: ['logistics', 'smelting_copper', 'wiring', 'electronics'] };
function grantTier(game: Game, tier: number): void {
  for (let t = game.machineTier + 1; t <= tier; t++) {
    research(game, ...TIER_TECHS[t].filter((id) => !game.researched.has(id)));
    const before = game.score;
    game.score = 1e9;
    expect(game.researchTier(), `Mk${t}`).toBe(true);
    game.score = before;
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
    research(game, 'smelting', 'assembly', 'logistics', 'land_1');
    expect(game.unlockedZone).toBe(1);
    expect(game.place('conveyor', ox, oy, 0)).toBe('ok');
  });
});

describe('custos de construção e remoção', () => {
  it('construir gasta pontos e o placar pode ficar negativo; recusa não cobra', () => {
    const game = new Game(SEED);
    const { x, y } = findSite(game, 4, 2, pureOre(game, Tile.Iron, 4));
    expect(game.score).toBe(0);
    expect(game.place('miner', x, y, 0)).toBe('ok');
    expect(game.score).toBe(-BUILD_COST.miner);
    expect(game.place('conveyor', x + 2, y, 0)).toBe('ok');
    expect(game.place('hub', x + 3, y, 0)).toBe('ok');
    expect(game.score).toBe(-(BUILD_COST.miner + BUILD_COST.conveyor + BUILD_COST.hub));
    const debt = game.score;
    expect(game.place('conveyor', x, y, 0)).toBe('occupied');
    expect(game.place('furnace', x, y + 4, 0)).toBe('locked');
    expect(game.score).toBe(debt); // construções recusadas não custam nada
  });

  it('versões mais altas custam mais; logística e Central não variam', () => {
    expect([1, 2, 3, 4].map((mk) => buildCost('miner', mk))).toEqual([60, 90, 120, 150]);
    expect(buildCost('conveyor', 4)).toBe(buildCost('conveyor', 1));
    expect(buildCost('hub', 3)).toBe(BUILD_COST.hub);
    const game = new Game(SEED);
    grantTier(game, 2);
    const { x, y } = findSite(game, 2, 2, pureOre(game, Tile.Iron, 4));
    game.score = 0;
    game.place('miner', x, y, 0, 2);
    expect(game.score).toBe(-buildCost('miner', 2));
  });

  it('remover custa o dobro de construir, por versão, e o placar pode ficar negativo', () => {
    const game = new Game(SEED);
    grantTier(game, 2);
    const { x, y } = findSite(game, 4, 2, pureOre(game, Tile.Iron, 4));
    game.place('conveyor', x + 2, y, 0);
    game.place('miner', x, y, 0, 2);
    game.score = 0;
    expect(game.remove(x + 2, y)).toEqual({ kind: 'conveyor', charged: 2 * BUILD_COST.conveyor });
    expect(game.remove(x, y)).toEqual({ kind: 'miner', charged: removalCost('miner', 2) });
    expect(game.score).toBe(-(2 * BUILD_COST.conveyor + 2 * buildCost('miner', 2)));
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
    const afterBuilding = game.score;
    runTicks(game, 400);
    expect(game.inventory.iron_ore).toBeGreaterThan(5);
    expect(game.score - afterBuilding).toBe(game.inventory.iron_ore);
  });

  it('fornalha transforma minério em placa e vale mais', () => {
    const game = new Game(SEED);
    research(game, 'smelting');
    const { x, y } = findSite(game, 6, 2, pureOre(game, Tile.Iron, 4));
    game.place('miner', x, y, 0);
    game.place('furnace', x + 2, y, 0);
    game.place('hub', x + 4, y, 0);
    const afterBuilding = game.score;
    runTicks(game, 800);
    expect(game.inventory.iron_plate).toBeGreaterThan(3);
    expect(game.inventory.iron_ore).toBe(0);
    expect(game.score - afterBuilding).toBe(game.inventory.iron_plate * ITEM_VALUE.iron_plate);
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
  it('gasta pontos do placar e exige a tecnologia anterior', () => {
    const game = new Game(SEED);
    game.score = 1000;
    expect(game.research('assembly')).toBe(false); // falta Fundição
    game.score = 29;
    expect(game.research('smelting')).toBe(false); // falta 1 ponto
    game.score = 30;
    expect(game.research('smelting')).toBe(true);
    expect(game.score).toBe(0);
    expect(game.isBuildingUnlocked('furnace')).toBe(true);
    expect(game.research('smelting')).toBe(false); // já pesquisada
    game.score = 80;
    expect(game.research('assembly')).toBe(true);
    expect(game.score).toBe(0);
  });

  it('dívida de construção bloqueia pesquisas até o placar cobrir o custo', () => {
    const game = new Game(SEED);
    game.score = -100;
    expect(game.research('smelting')).toBe(false);
    game.score = 29;
    expect(game.research('smelting')).toBe(false);
    game.score = 30;
    expect(game.research('smelting')).toBe(true);
    expect(game.score).toBe(0);
  });

  it('itens entregues não pagam pesquisa, só pontos', () => {
    const game = new Game(SEED);
    game.inventory.iron_ore = 1_000_000;
    game.score = 0;
    expect(game.research('smelting')).toBe(false);
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

describe('versões Mk', () => {
  it('cada versão custa mais pontos e soma 10% de desempenho', () => {
    expect([tierCost(2), tierCost(3), tierCost(4)]).toEqual([2000, 5000, 12500]);
    expect([tierBoost(1), tierBoost(2), tierBoost(4)].map((v) => +v.toFixed(2))).toEqual([1, 1.1, 1.3]);
  });

  it('a pesquisa gasta pontos do placar, na ordem, e só com saldo', () => {
    const game = new Game(SEED);
    research(game, 'smelting', 'assembly');
    game.score = 1999;
    expect(game.researchTier()).toBe(false);
    game.score = 2500;
    expect(game.researchTier()).toBe(true);
    expect(game.machineTier).toBe(2);
    expect(game.score).toBe(500);
    expect(game.nextTierCost()).toBe(5000);
    expect(game.researchTier()).toBe(false);
  });

  it('cada versão exige tecnologias: Mk2 Montagem, Mk3 Eletrônica, Mk4 Robótica + Expansão II', () => {
    const game = new Game(SEED);
    game.score = 1e12;
    expect(game.researchTier()).toBe(false); // Mk2 sem Montagem
    research(game, 'smelting', 'assembly');
    game.score = 1e12;
    expect(game.researchTier()).toBe(true);
    expect(game.researchTier()).toBe(false); // Mk3 sem Eletrônica
    expect(game.missingRequirements(['electronics'])).toEqual(['electronics']);
    grantTier(game, 3);
    game.score = 1e12;
    expect(game.researchTier()).toBe(false); // Mk4 sem Robótica e Expansão II
    for (const tech of ['land_1', 'land_2', 'robotics']) {
      game.score = 1e12;
      expect(game.research(tech), tech).toBe(true);
    }
    game.score = 1e12;
    expect(game.researchTier()).toBe(true);
    expect(game.machineTier).toBe(4);
  });

  it('só constrói versões já pesquisadas; logística e Central ficam na Mk1', () => {
    const game = new Game(SEED);
    const { x, y } = findSite(game, 4, 2, pureOre(game, Tile.Iron, 4));
    expect(game.place('miner', x, y, 0, 2)).toBe('locked');
    grantTier(game, 3);
    expect(game.machineTier).toBe(3);
    expect(game.place('miner', x, y, 0, 4)).toBe('locked');
    expect(game.place('miner', x, y, 0, 3)).toBe('ok');
    expect(game.entityAt(x, y)!.mk).toBe(3);
    expect(game.place('hub', x + 2, y, 0, 3)).toBe('ok');
    expect(game.entityAt(x + 2, y)!.mk).toBe(1);
  });

  it('a mineradora Mk3 rende 20% a mais que a Mk1 no mesmo sítio', () => {
    const delivered = (mk: number) => {
      const game = new Game(SEED);
      grantTier(game, 3);
      const { x, y } = findSite(game, 4, 2, pureOre(game, Tile.Iron, 4));
      game.place('miner', x, y, 0, mk);
      game.place('hub', x + 2, y, 0);
      runTicks(game, 1200);
      return game.inventory.iron_ore;
    };
    const base = delivered(1);
    const upgraded = delivered(3);
    expect(upgraded / base).toBeGreaterThan(1.15);
    expect(upgraded / base).toBeLessThan(1.25);
  });
});

describe('árvore de requisitos', () => {
  const ids = new Set(TECHS.map((t) => t.id));

  it('tem requisitos de 2 e de 3 tecnologias', () => {
    expect(TECHS.some((t) => t.requires?.length === 2)).toBe(true);
    expect(TECHS.some((t) => t.requires?.length === 3)).toBe(true);
  });

  it('só referencia tecnologias existentes ou versões válidas', () => {
    for (const tech of TECHS) {
      for (const id of tech.requires ?? []) {
        const mk = /^mk(\d+)$/.exec(id);
        expect(ids.has(id) || (mk && Number(mk[1]) >= 2 && Number(mk[1]) <= MAX_TIER), `${tech.id} -> ${id}`).toBeTruthy();
      }
    }
  });

  it('é possível pesquisar tudo, em alguma ordem (sem ciclos nem travas)', () => {
    const game = new Game(SEED);
    let progress = true;
    while (progress) {
      progress = false;
      game.score = 1e12;
      for (const tech of TECHS) if (game.research(tech.id)) progress = true;
      if (game.researchTier()) progress = true;
    }
    expect(game.researched.size).toBe(TECHS.length);
    expect(game.machineTier).toBe(MAX_TIER);
    expect(game.unlockedZone).toBe(3);
  });

  it('exige TODOS os requisitos (2 em Eletrônica, 3 em Robótica)', () => {
    const game = new Game(SEED);
    game.score = 1e12;
    for (const tech of ['smelting', 'logistics', 'assembly', 'smelting_copper']) expect(game.research(tech), tech).toBe(true);
    expect(game.research('electronics')).toBe(false); // falta Fiação (tem Logística)
    expect(game.research('wiring')).toBe(true);
    expect(game.research('electronics')).toBe(true); // Fiação + Logística
    expect(game.research('land_1')).toBe(true);
    expect(game.research('robotics')).toBe(false); // tem Eletrônica e Expansão I, falta Mk2
    expect(game.researchTier()).toBe(true);
    expect(game.research('robotics')).toBe(true);
  });
});

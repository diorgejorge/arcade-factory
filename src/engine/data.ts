import type { BuildingKind, ItemId, Recipe, Tech } from './types';

export const ITEM_IDS: readonly ItemId[] = [
  'iron_ore',
  'copper_ore',
  'iron_plate',
  'copper_plate',
  'gear',
  'wire',
  'circuit',
  'motor',
];

export const ITEM_LABEL: Record<ItemId, string> = {
  iron_ore: 'Minério de ferro',
  copper_ore: 'Minério de cobre',
  iron_plate: 'Placa de ferro',
  copper_plate: 'Placa de cobre',
  gear: 'Engrenagem',
  wire: 'Fio',
  circuit: 'Circuito',
  motor: 'Motor',
};

export const BUILDING_LABEL: Record<BuildingKind, string> = {
  miner: 'Mineradora',
  conveyor: 'Esteira',
  furnace: 'Fornalha',
  assembler: 'Montadora',
  hub: 'Central',
  junction: 'Junção',
  router: 'Roteador',
};

/** Lado da área quadrada que cada construção ocupa. Máquinas grandes custam espaço, mas produzem mais. */
export const BUILDING_SIZE: Record<BuildingKind, number> = {
  miner: 2,
  conveyor: 1,
  furnace: 2,
  assembler: 3,
  hub: 2,
  junction: 1,
  router: 1,
};

/** Pontos descontados do placar ao remover uma construção (nunca deixa o placar abaixo de zero). */
export const REMOVAL_COST: Record<BuildingKind, number> = {
  conveyor: 2,
  junction: 6,
  router: 6,
  miner: 40,
  furnace: 60,
  assembler: 150,
  hub: 100,
};

/** Multiplicador de velocidade de produção das máquinas. */
export const CRAFT_SPEED: Partial<Record<BuildingKind, number>> = { furnace: 3, assembler: 4 };

export const BUILDING_ORDER: readonly BuildingKind[] = ['miner', 'conveyor', 'junction', 'router', 'furnace', 'assembler', 'hub'];
export const STARTING_BUILDINGS: readonly BuildingKind[] = ['miner', 'conveyor', 'hub'];

export const RECIPES: Record<string, Recipe> = {
  smelt_iron: { id: 'smelt_iron', machine: 'furnace', inputs: { iron_ore: 1 }, output: 'iron_plate', outputCount: 1, ticks: 40 },
  smelt_copper: { id: 'smelt_copper', machine: 'furnace', inputs: { copper_ore: 1 }, output: 'copper_plate', outputCount: 1, ticks: 40 },
  gear: { id: 'gear', machine: 'assembler', inputs: { iron_plate: 2 }, output: 'gear', outputCount: 1, ticks: 30 },
  wire: { id: 'wire', machine: 'assembler', inputs: { copper_plate: 1 }, output: 'wire', outputCount: 2, ticks: 20 },
  circuit: { id: 'circuit', machine: 'assembler', inputs: { iron_plate: 1, wire: 3 }, output: 'circuit', outputCount: 1, ticks: 40 },
  motor: { id: 'motor', machine: 'assembler', inputs: { gear: 2, circuit: 1 }, output: 'motor', outputCount: 1, ticks: 60 },
};

export const RECIPE_LABEL: Record<string, string> = {
  smelt_iron: 'Fundir ferro',
  smelt_copper: 'Fundir cobre',
  gear: 'Engrenagem',
  wire: 'Fio',
  circuit: 'Circuito',
  motor: 'Motor',
};

/** Receita de fornalha indexada pelo minério de entrada. */
export const FURNACE_RECIPE_BY_INPUT: Partial<Record<ItemId, Recipe>> = Object.fromEntries(
  Object.values(RECIPES)
    .filter((recipe) => recipe.machine === 'furnace')
    .map((recipe) => [Object.keys(recipe.inputs)[0], recipe]),
);

export const TECHS: readonly Tech[] = [
  { id: 'smelting', name: 'Fundição', cost: { iron_ore: 30 }, buildings: ['furnace'], recipes: ['smelt_iron', 'smelt_copper'] },
  { id: 'logistics', name: 'Logística', cost: { iron_plate: 25 }, requires: 'smelting', buildings: ['junction', 'router'] },
  { id: 'assembly', name: 'Montagem', cost: { iron_plate: 40 }, requires: 'smelting', buildings: ['assembler'], recipes: ['gear'] },
  { id: 'land_1', name: 'Expansão I', cost: { iron_plate: 80 }, requires: 'assembly', effect: 'expand_land' },
  { id: 'electronics', name: 'Eletrônica', cost: { gear: 20, copper_plate: 30 }, requires: 'assembly', recipes: ['wire', 'circuit'] },
  { id: 'land_2', name: 'Expansão II', cost: { gear: 40, copper_plate: 60 }, requires: 'land_1', effect: 'expand_land' },
  { id: 'robotics', name: 'Robótica', cost: { circuit: 20, gear: 20 }, requires: 'electronics', recipes: ['motor'] },
  { id: 'land_3', name: 'Expansão III', cost: { circuit: 40, gear: 40 }, requires: 'land_2', effect: 'expand_land' },
  { id: 'overclock', name: 'Overclock', cost: { motor: 5 }, requires: 'robotics', effect: 'miner_boost' },
];

/** Cada nível de transformação multiplica o valor dos ingredientes por este fator. */
const TIER_MULTIPLIER = 2;
const RAW_VALUE = 1;

const recipeByOutput = new Map(Object.values(RECIPES).map((recipe) => [recipe.output, recipe]));

function valueOf(item: ItemId): number {
  const recipe = recipeByOutput.get(item);
  if (!recipe) return RAW_VALUE;
  let ingredients = 0;
  for (const [input, count] of Object.entries(recipe.inputs)) ingredients += count * valueOf(input as ItemId);
  return (ingredients / recipe.outputCount) * TIER_MULTIPLIER;
}

/** Pontos por item entregue: quanto mais complexa a cadeia, mais vale. */
export const ITEM_VALUE = Object.fromEntries(ITEM_IDS.map((item) => [item, valueOf(item)])) as Record<ItemId, number>;

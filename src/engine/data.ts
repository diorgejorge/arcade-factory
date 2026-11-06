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

/** Pontos gastos para construir (Mk1). Valores provisórios, a acertar jogando. */
export const BUILD_COST: Record<BuildingKind, number> = {
  conveyor: 2,
  junction: 8,
  router: 8,
  miner: 60,
  furnace: 90,
  assembler: 240,
  hub: 150,
};

/** Máquinas que têm versões Mk2, Mk3... (logística e Central não têm). */
export const TIERED_KINDS: readonly BuildingKind[] = ['miner', 'furnace', 'assembler'];
export const MAX_TIER = 8;
/** Cada versão acima da Mk1 soma 10% de desempenho (Mk4 = +30%). */
export const TIER_BONUS = 0.1;
export const tierBoost = (mk: number): number => 1 + TIER_BONUS * (mk - 1);
/** Cada versão acima da Mk1 encarece a construção em 50% do preço base (Mk4 = 2,5x) para +10% de desempenho cada. */
const MK_COST_STEP = 0.5;
/** Pontos gastos ao construir `kind` na versão `mk` (logística e Central não têm versões). */
export const buildCost = (kind: BuildingKind, mk = 1): number =>
  Math.round(BUILD_COST[kind] * (1 + MK_COST_STEP * ((TIERED_KINDS.includes(kind) ? mk : 1) - 1)));
/** Remover custa o dobro de construir: trocar de lugar é pagar duas vezes (e mais a construção nova). */
export const removalCost = (kind: BuildingKind, mk = 1): number => 2 * buildCost(kind, mk);
/** Pontos para pesquisar a versão `tier` (Mk2 em diante): 2000, 5000, 12500... valores provisórios de balanceamento. */
export const tierCost = (tier: number): number => Math.round(2000 * 2.5 ** (tier - 2));

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

/**
 * Árvore de pesquisa. Todas custam pontos do placar e exigem TODOS os requisitos listados
 * (tecnologias, ou `mkN` = máquinas na versão N). Custos provisórios, a acertar jogando.
 * Ramos: processamento (fundição → montagem → fiação → eletrônica → robótica), logística/território
 * (logística → expansões) e a evolução das máquinas (Mk), que se cruzam em Robótica (3 requisitos).
 */
export const TECHS: readonly Tech[] = [
  { id: 'smelting', name: 'Fundição de ferro', cost: 30, buildings: ['furnace'], recipes: ['smelt_iron'] },
  { id: 'smelting_copper', name: 'Fundição de cobre', cost: 60, requires: ['smelting'], recipes: ['smelt_copper'] },
  { id: 'logistics', name: 'Logística', cost: 50, requires: ['smelting'], buildings: ['junction', 'router'] },
  { id: 'assembly', name: 'Montagem', cost: 80, requires: ['smelting'], buildings: ['assembler'], recipes: ['gear'] },
  { id: 'wiring', name: 'Fiação', cost: 120, requires: ['assembly', 'smelting_copper'], recipes: ['wire'] },
  { id: 'land_1', name: 'Expansão I', cost: 160, requires: ['assembly', 'logistics'], effect: 'expand_land' },
  { id: 'electronics', name: 'Eletrônica', cost: 220, requires: ['wiring', 'logistics'], recipes: ['circuit'] },
  { id: 'land_2', name: 'Expansão II', cost: 440, requires: ['land_1', 'electronics'], effect: 'expand_land' },
  { id: 'robotics', name: 'Robótica', cost: 600, requires: ['electronics', 'land_1', 'mk2'], recipes: ['motor'] },
  { id: 'land_3', name: 'Expansão III', cost: 960, requires: ['land_2', 'robotics'], effect: 'expand_land' },
  { id: 'overclock', name: 'Overclock', cost: 800, requires: ['robotics', 'land_2'], effect: 'miner_boost' },
];

/** Requisitos (além da versão anterior) para pesquisar a versão `tier` das máquinas. */
export const tierRequires = (tier: number): readonly string[] =>
  tier <= 2 ? ['assembly'] : tier === 3 ? ['electronics'] : tier === 4 ? ['robotics', 'land_2'] : ['overclock'];

const techById = new Map(TECHS.map((tech) => [tech.id, tech]));
export const requirementLabel = (id: string): string => (id.startsWith('mk') ? `Máquinas Mk${id.slice(2)}` : techById.get(id)!.name);

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

/** Nó da árvore de pesquisa: tecnologia ou versão de máquinas (Mk). Os requisitos são as ligações do grafo. */
export interface TreeNode {
  id: string;
  name: string;
  cost: number;
  requires: readonly string[];
  /** Presente nos nós de versão de máquinas. */
  tier?: number;
  info: string;
}

const techInfo = (tech: Tech): string =>
  [
    tech.buildings?.length ? `Libera: ${tech.buildings.map((b) => BUILDING_LABEL[b]).join(', ')}` : '',
    tech.recipes?.length ? `Receitas: ${tech.recipes.map((r) => RECIPE_LABEL[r]).join(', ')}` : '',
    tech.effect === 'expand_land' ? 'Libera a próxima zona da ilha' : '',
    tech.effect === 'miner_boost' ? 'Mineradoras 50% mais rápidas' : '',
  ]
    .filter(Boolean)
    .join(' · ');

/** Tecnologias e versões Mk juntas: é o que a tela da árvore desenha (nós = pesquisas, setas = requisitos). */
export const TECH_GRAPH: readonly TreeNode[] = [
  ...TECHS.map((tech) => ({ id: tech.id, name: tech.name, cost: tech.cost, requires: tech.requires ?? [], info: techInfo(tech) })),
  ...Array.from({ length: MAX_TIER - 1 }, (_, i): TreeNode => {
    const tier = i + 2;
    return {
      id: `mk${tier}`,
      name: `Máquinas Mk${tier}`,
      cost: tierCost(tier),
      requires: [...(tier > 2 ? [`mk${tier - 1}`] : []), ...tierRequires(tier)],
      tier,
      info: `Mineradora, fornalha e montadora +${Math.round(TIER_BONUS * (tier - 1) * 100)}%`,
    };
  }),
];

export const BUILDING_INFO: Record<BuildingKind, string> = {
  miner: 'Extrai minério do chão. Rende por tile de minério sob ela (até 4).',
  conveyor: 'Leva itens de um ponto a outro. Arraste para desenhar o caminho.',
  junction: 'Cruza duas esteiras: cada item segue em linha reta.',
  router: 'Reparte os itens em revezamento entre as saídas.',
  furnace: 'Funde minério em placas.',
  assembler: 'Fabrica itens a partir de ingredientes. Escolha a receita na máquina.',
  hub: 'Recebe os itens e os converte em pontos.',
};

/** Tecnologia que libera a construção, ou undefined se ela já vem liberada. */
export const unlockingTech = (kind: BuildingKind): Tech | undefined => TECHS.find((tech) => tech.buildings?.includes(kind));

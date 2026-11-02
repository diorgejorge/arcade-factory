export type ItemId =
  | 'iron_ore'
  | 'copper_ore'
  | 'iron_plate'
  | 'copper_plate'
  | 'gear'
  | 'wire'
  | 'circuit'
  | 'motor';

export type BuildingKind = 'miner' | 'conveyor' | 'furnace' | 'assembler' | 'hub';
export type CrafterKind = 'furnace' | 'assembler';

/** 0 = leste, 1 = sul, 2 = oeste, 3 = norte */
export type Dir = 0 | 1 | 2 | 3;

export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

export const oppositeDir = (dir: Dir): Dir => ((dir + 2) % 4) as Dir;

export type ItemCounts = Partial<Record<ItemId, number>>;

export interface Recipe {
  id: string;
  machine: CrafterKind;
  inputs: ItemCounts;
  output: ItemId;
  outputCount: number;
  ticks: number;
}

export interface Tech {
  id: string;
  name: string;
  cost: ItemCounts;
  requires?: string;
  buildings?: BuildingKind[];
  recipes?: string[];
  effect?: 'miner_boost';
}

export interface BeltItem {
  kind: ItemId;
  /** Posição dentro do tile de origem (0 = entrada, 1 = saída). */
  pos: number;
  /** Posição no mundo (em tiles) neste tick e no anterior, usada para interpolar o desenho. */
  wx: number;
  wy: number;
  pwx: number;
  pwy: number;
}

export interface Entity {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  dir: Dir;
  /** Itens na esteira, do mais à frente para o mais atrás. */
  belt: BeltItem[];
  /** Receita atual (montadora escolhida pelo jogador; fornalha definida pelo minério recebido). */
  recipeId?: string;
  /** Minério extraído (apenas mineradoras). */
  ore?: ItemId;
  inputs: ItemCounts;
  outItem?: ItemId;
  outCount: number;
  crafting: boolean;
  progress: number;
}

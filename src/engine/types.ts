export type ItemId =
  | 'iron_ore'
  | 'copper_ore'
  | 'iron_plate'
  | 'copper_plate'
  | 'gear'
  | 'wire'
  | 'circuit'
  | 'motor';

export type BuildingKind = 'miner' | 'conveyor' | 'furnace' | 'assembler' | 'hub' | 'junction' | 'router';
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
  effect?: 'miner_boost' | 'expand_land';
}

export interface BeltItem {
  kind: ItemId;
  /** Direção em que o item viaja (usada por junções e roteadores). */
  dir: Dir;
  /** Progresso dentro do tile atual (0 = entrada, 1 = saída). */
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
  /** Canto superior esquerdo da área ocupada. */
  x: number;
  y: number;
  /** Lado da área quadrada ocupada, em tiles. */
  size: number;
  dir: Dir;
  /** Itens em trânsito (esteira, junção ou roteador), do mais à frente para o mais atrás. */
  belt: BeltItem[];
  /** Receita atual (montadora escolhida pelo jogador; fornalha definida pelo minério recebido). */
  recipeId?: string;
  /** Minério extraído (apenas mineradoras) e quantos tiles dele estão sob a máquina. */
  ore?: ItemId;
  oreCount: number;
  /** Estoque: ingredientes (máquinas) ou itens entregues (central). */
  inputs: ItemCounts;
  outItem?: ItemId;
  outCount: number;
  crafting: boolean;
  progress: number;
  /** Próxima célula de saída a tentar (revezamento entre as bordas da máquina). */
  outCursor: number;
}

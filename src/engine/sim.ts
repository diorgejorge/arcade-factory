import { ITEM_IDS, ITEM_VALUE, RECIPES, STARTING_BUILDINGS, TECHS } from './data';
import { MINER_TICKS, MINER_TICKS_BOOSTED, createEntity, stepEntity, type World } from './machines';
import type { BuildingKind, Dir, Entity, ItemId } from './types';
import { generateTerrain, Tile, type Terrain } from './world';

export const TICK_RATE = 20;

export type PlaceResult = 'ok' | 'out_of_bounds' | 'blocked' | 'occupied' | 'locked' | 'needs_ore';

const emptyInventory = (): Record<ItemId, number> =>
  Object.fromEntries(ITEM_IDS.map((item) => [item, 0])) as Record<ItemId, number>;

/** Estado completo de uma fábrica. Determinístico: mesma seed + mesmos comandos = mesmo resultado. */
export class Game implements World {
  readonly terrain: Terrain;
  readonly entities: Entity[] = [];
  readonly inventory = emptyInventory();
  readonly researched = new Set<string>();
  tick = 0;
  score = 0;

  private readonly grid: (Entity | undefined)[];
  private readonly unlockedBuildings = new Set<BuildingKind>(STARTING_BUILDINGS);
  private readonly unlockedRecipes = new Set<string>();
  private minerBoost = false;
  private nextId = 1;

  constructor(readonly seed: number) {
    this.terrain = generateTerrain(seed);
    this.grid = new Array(this.terrain.width * this.terrain.height);
  }

  get minerTicks(): number {
    return this.minerBoost ? MINER_TICKS_BOOSTED : MINER_TICKS;
  }

  entityAt(x: number, y: number): Entity | undefined {
    return this.inBounds(x, y) ? this.grid[y * this.terrain.width + x] : undefined;
  }

  isBuildingUnlocked(kind: BuildingKind): boolean {
    return this.unlockedBuildings.has(kind);
  }

  isRecipeUnlocked(recipeId: string): boolean {
    return this.unlockedRecipes.has(recipeId);
  }

  deliver(item: ItemId): void {
    this.inventory[item]++;
    this.score += ITEM_VALUE[item];
  }

  place(kind: BuildingKind, x: number, y: number, dir: Dir): PlaceResult {
    if (!this.inBounds(x, y)) return 'out_of_bounds';
    if (!this.unlockedBuildings.has(kind)) return 'locked';
    const tile = this.terrain.tiles[y * this.terrain.width + x];
    if (tile === Tile.Rock) return 'blocked';
    if (this.entityAt(x, y)) return 'occupied';
    const ore = tile === Tile.Iron ? 'iron_ore' : tile === Tile.Copper ? 'copper_ore' : undefined;
    if (kind === 'miner' && !ore) return 'needs_ore';

    const entity = createEntity(this.nextId++, kind, x, y, dir);
    if (kind === 'miner') entity.ore = ore;
    this.grid[y * this.terrain.width + x] = entity;
    this.entities.push(entity);
    return 'ok';
  }

  remove(x: number, y: number): boolean {
    const entity = this.entityAt(x, y);
    if (!entity) return false;
    this.grid[y * this.terrain.width + x] = undefined;
    this.entities.splice(this.entities.indexOf(entity), 1);
    return true;
  }

  rotate(x: number, y: number): void {
    const entity = this.entityAt(x, y);
    if (entity) entity.dir = ((entity.dir + 1) % 4) as Dir;
  }

  setDir(x: number, y: number, dir: Dir): void {
    const entity = this.entityAt(x, y);
    if (entity) entity.dir = dir;
  }

  /** Troca a receita de uma montadora, descartando o conteúdo anterior. */
  setRecipe(x: number, y: number, recipeId: string): boolean {
    const entity = this.entityAt(x, y);
    const recipe = RECIPES[recipeId];
    if (entity?.kind !== 'assembler' || recipe?.machine !== 'assembler' || !this.unlockedRecipes.has(recipeId)) return false;
    entity.recipeId = recipeId;
    entity.inputs = {};
    entity.outItem = undefined;
    entity.outCount = 0;
    entity.crafting = false;
    entity.progress = 0;
    return true;
  }

  canResearch(techId: string): boolean {
    const tech = TECHS.find((t) => t.id === techId);
    if (!tech || this.researched.has(techId)) return false;
    if (tech.requires && !this.researched.has(tech.requires)) return false;
    return Object.entries(tech.cost).every(([item, count]) => this.inventory[item as ItemId] >= count);
  }

  /** Gasta itens entregues na Central para desbloquear uma tecnologia. */
  research(techId: string): boolean {
    if (!this.canResearch(techId)) return false;
    const tech = TECHS.find((t) => t.id === techId)!;
    for (const [item, count] of Object.entries(tech.cost)) this.inventory[item as ItemId] -= count;
    this.researched.add(techId);
    tech.buildings?.forEach((building) => this.unlockedBuildings.add(building));
    tech.recipes?.forEach((recipe) => this.unlockedRecipes.add(recipe));
    if (tech.effect === 'miner_boost') this.minerBoost = true;
    return true;
  }

  step(): void {
    for (const entity of this.entities) stepEntity(this, entity);
    this.tick++;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.terrain.width && y < this.terrain.height;
  }
}

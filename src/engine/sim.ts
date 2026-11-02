import { BUILDING_SIZE, ITEM_IDS, ITEM_VALUE, RECIPES, STARTING_BUILDINGS, TECHS } from './data';
import { createEntity, stepEntity, type World } from './machines';
import type { BuildingKind, Dir, Entity, ItemId } from './types';
import { generateTerrain, isBuildableTile, MAX_ZONE, Tile, VOID_ZONE, type Terrain } from './world';

export const TICK_RATE = 20;
const MINER_BOOST = 1.5;

export type PlaceResult = 'ok' | 'out_of_bounds' | 'blocked' | 'occupied' | 'locked' | 'out_of_zone' | 'needs_ore';

const emptyInventory = (): Record<ItemId, number> =>
  Object.fromEntries(ITEM_IDS.map((item) => [item, 0])) as Record<ItemId, number>;

interface OreSurvey {
  ore: ItemId;
  count: number;
}

/** Estado completo de uma fábrica. Determinístico: mesma seed + mesmos comandos = mesmo resultado. */
export class Game implements World {
  readonly terrain: Terrain;
  readonly entities: Entity[] = [];
  readonly inventory = emptyInventory();
  readonly researched = new Set<string>();
  tick = 0;
  score = 0;
  /** Maior zona da ilha já liberada para construção. */
  unlockedZone = 0;

  private readonly grid: (Entity | undefined)[];
  private readonly unlockedBuildings = new Set<BuildingKind>(STARTING_BUILDINGS);
  private readonly unlockedRecipes = new Set<string>();
  private minerBoost = false;
  private nextId = 1;

  constructor(readonly seed: number) {
    this.terrain = generateTerrain(seed);
    this.grid = new Array(this.terrain.width * this.terrain.height);
  }

  get minerRate(): number {
    return this.minerBoost ? MINER_BOOST : 1;
  }

  /** Entidade que cobre a célula (x, y), se houver. */
  entityAt(x: number, y: number): Entity | undefined {
    return this.inBounds(x, y) ? this.grid[y * this.terrain.width + x] : undefined;
  }

  isBuildingUnlocked(kind: BuildingKind): boolean {
    return this.unlockedBuildings.has(kind);
  }

  isRecipeUnlocked(recipeId: string): boolean {
    return this.unlockedRecipes.has(recipeId);
  }

  isZoneUnlocked(x: number, y: number): boolean {
    return this.terrain.zones[y * this.terrain.width + x] <= this.unlockedZone;
  }

  deliver(item: ItemId): void {
    this.inventory[item]++;
    this.score += ITEM_VALUE[item];
  }

  /** Verifica se `kind` cabe com o canto superior esquerdo em (x, y), sem construir. */
  canPlace(kind: BuildingKind, x: number, y: number): PlaceResult {
    if (!this.unlockedBuildings.has(kind)) return 'locked';
    const size = BUILDING_SIZE[kind];
    const ore = this.surveyOre(x, y, size);
    for (let cy = y; cy < y + size; cy++) {
      for (let cx = x; cx < x + size; cx++) {
        if (!this.inBounds(cx, cy)) return 'out_of_bounds';
        const index = cy * this.terrain.width + cx;
        if (!isBuildableTile(this.terrain.tiles[index])) return 'blocked';
        if (this.terrain.zones[index] === VOID_ZONE || this.terrain.zones[index] > this.unlockedZone) return 'out_of_zone';
        if (this.grid[index]) return 'occupied';
      }
    }
    return kind === 'miner' && !ore ? 'needs_ore' : 'ok';
  }

  place(kind: BuildingKind, x: number, y: number, dir: Dir): PlaceResult {
    const result = this.canPlace(kind, x, y);
    if (result !== 'ok') return result;
    const size = BUILDING_SIZE[kind];
    const entity = createEntity(this.nextId++, kind, x, y, size, dir);
    const ore = kind === 'miner' ? this.surveyOre(x, y, size) : undefined;
    if (ore) {
      entity.ore = ore.ore;
      entity.oreCount = ore.count;
    }
    for (let cy = y; cy < y + size; cy++) for (let cx = x; cx < x + size; cx++) this.grid[cy * this.terrain.width + cx] = entity;
    this.entities.push(entity);
    return 'ok';
  }

  /** Remove a construção que cobre a célula (x, y). */
  remove(x: number, y: number): boolean {
    const entity = this.entityAt(x, y);
    if (!entity) return false;
    for (let cy = entity.y; cy < entity.y + entity.size; cy++) {
      for (let cx = entity.x; cx < entity.x + entity.size; cx++) this.grid[cy * this.terrain.width + cx] = undefined;
    }
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
    if (tech.effect === 'expand_land' && this.unlockedZone >= MAX_ZONE) return false;
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
    if (tech.effect === 'expand_land') this.unlockedZone++;
    return true;
  }

  step(): void {
    for (const entity of this.entities) stepEntity(this, entity);
    this.tick++;
  }

  /** Minério predominante sob a área e quantos tiles dele há (a mineradora produz por tile). */
  private surveyOre(x: number, y: number, size: number): OreSurvey | undefined {
    let iron = 0;
    let copper = 0;
    for (let cy = y; cy < y + size; cy++) {
      for (let cx = x; cx < x + size; cx++) {
        if (!this.inBounds(cx, cy)) continue;
        const tile = this.terrain.tiles[cy * this.terrain.width + cx];
        if (tile === Tile.Iron) iron++;
        else if (tile === Tile.Copper) copper++;
      }
    }
    if (iron === 0 && copper === 0) return undefined;
    return iron >= copper ? { ore: 'iron_ore', count: iron } : { ore: 'copper_ore', count: copper };
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.terrain.width && y < this.terrain.height;
  }
}

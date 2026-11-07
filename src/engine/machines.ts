import { CRAFT_SPEED, FURNACE_RECIPE_BY_INPUT, RECIPES, tierBoost } from './data';
import type { BeltItem, BuildingKind, Dir, Entity, ItemId, Recipe } from './types';
import { DX, DY, oppositeDir } from './types';

/** Contrato mínimo que as máquinas precisam do jogo (evita dependência circular). */
export interface World {
  entityAt(x: number, y: number): Entity | undefined;
  deliver(item: ItemId): void;
  isRecipeUnlocked(recipeId: string): boolean;
  /** Multiplicador de velocidade das mineradoras (1, ou mais após Overclock). */
  readonly minerRate: number;
}

export const BELT_SPEED = 0.06; // tiles por tick
export const BELT_SPACING = 0.34;
export const BELT_CAPACITY = 3;
const JUNCTION_LANE_CAPACITY = 2;
const OUTPUT_CAP = 4;
const INPUT_BUFFER_FACTOR = 2;
/** Uma mineradora com 1 minério embaixo leva MINER_CYCLE ticks por item; com 4, um quarto disso. */
export const MINER_CYCLE = 60;

export function createEntity(id: number, kind: BuildingKind, x: number, y: number, size: number, dir: Dir, mk: number): Entity {
  return { id, kind, x, y, size, dir, mk, belt: [], inputs: {}, oreCount: 0, outCount: 0, crafting: false, progress: 0, outCursor: 0 };
}

function placeAlong(entity: Entity, item: BeltItem, dir: Dir): void {
  item.wx = entity.x + 0.5 + DX[dir] * (item.pos - 0.5);
  item.wy = entity.y + 0.5 + DY[dir] * (item.pos - 0.5);
}

function newItem(kind: ItemId, dir: Dir, fromX: number, fromY: number): BeltItem {
  return { kind, dir, pos: 0, wx: fromX, wy: fromY, pwx: fromX, pwy: fromY };
}

function currentRecipe(entity: Entity): Recipe | undefined {
  return entity.recipeId ? RECIPES[entity.recipeId] : undefined;
}

export function canAccept(world: World, target: Entity, kind: ItemId, travelDir: Dir): boolean {
  switch (target.kind) {
    case 'conveyor': {
      if (target.dir === oppositeDir(travelDir) || target.belt.length >= BELT_CAPACITY) return false;
      const last = target.belt[target.belt.length - 1];
      return !last || last.pos >= BELT_SPACING;
    }
    case 'junction': {
      const lane = target.belt.filter((item) => item.dir === travelDir);
      return lane.length < JUNCTION_LANE_CAPACITY && (lane.length === 0 || lane[lane.length - 1].pos >= BELT_SPACING);
    }
    case 'router':
      return target.belt.length === 0;
    case 'hub':
      return true;
    case 'assembler': {
      const need = currentRecipe(target)?.inputs[kind];
      return need !== undefined && (target.inputs[kind] ?? 0) < need * INPUT_BUFFER_FACTOR;
    }
    case 'furnace': {
      const recipe = FURNACE_RECIPE_BY_INPUT[kind];
      if (!recipe || !world.isRecipeUnlocked(recipe.id)) return false;
      if (target.recipeId && target.recipeId !== recipe.id) return false;
      if (target.outCount > 0 && target.outItem !== recipe.output) return false;
      return (target.inputs[kind] ?? 0) < INPUT_BUFFER_FACTOR;
    }
    default:
      return false;
  }
}

function receive(world: World, target: Entity, item: BeltItem, travelDir: Dir): void {
  item.dir = travelDir;
  switch (target.kind) {
    case 'conveyor':
      item.pos = 0;
      target.belt.push(item);
      placeAlong(target, item, target.dir);
      break;
    case 'junction':
      item.pos = 0;
      target.belt.push(item);
      placeAlong(target, item, travelDir);
      break;
    case 'router':
      item.pos = 0.5;
      target.belt.push(item);
      placeAlong(target, item, travelDir);
      break;
    case 'hub':
      target.inputs[item.kind] = (target.inputs[item.kind] ?? 0) + 1;
      world.deliver(item.kind);
      break;
    case 'furnace':
      target.recipeId ??= FURNACE_RECIPE_BY_INPUT[item.kind]?.id;
      target.inputs[item.kind] = (target.inputs[item.kind] ?? 0) + 1;
      break;
    case 'assembler':
      target.inputs[item.kind] = (target.inputs[item.kind] ?? 0) + 1;
      break;
  }
}

/** Entrega um item a `target` se ele aceitar. `from` é o centro de onde o item parece sair. */
export function offerItem(world: World, target: Entity, kind: ItemId, travelDir: Dir, from: { x: number; y: number }): boolean {
  if (!canAccept(world, target, kind, travelDir)) return false;
  receive(world, target, newItem(kind, travelDir, from.x, from.y), travelDir);
  return true;
}

const centerOf = (entity: Entity) => ({ x: entity.x + entity.size / 2, y: entity.y + entity.size / 2 });

/** Células vizinhas, na borda para onde a máquina aponta, onde ela pode despejar itens. */
function outputCell(entity: Entity, index: number): [number, number] {
  const { x, y, size } = entity;
  switch (entity.dir) {
    case 0: return [x + size, y + index];
    case 1: return [x + index, y + size];
    case 2: return [x - 1, y + index];
    default: return [x + index, y - 1];
  }
}

function pushOutput(world: World, entity: Entity): void {
  if (entity.outCount === 0 || !entity.outItem) return;
  for (let k = 0; k < entity.size; k++) {
    const index = (entity.outCursor + k) % entity.size;
    const [cx, cy] = outputCell(entity, index);
    const target = world.entityAt(cx, cy);
    if (target && target !== entity && offerItem(world, target, entity.outItem, entity.dir, centerOf(entity))) {
      entity.outCursor = (index + 1) % entity.size;
      entity.outCount--;
      return;
    }
  }
}

function stepConveyor(world: World, belt: Entity): void {
  const items = belt.belt;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    item.pwx = item.wx;
    item.pwy = item.wy;
    const limit = i === 0 ? 1 : items[i - 1].pos - BELT_SPACING;
    item.pos = Math.min(item.pos + BELT_SPEED, Math.max(limit, item.pos));
    placeAlong(belt, item, belt.dir);
  }
  const front = items[0];
  if (!front || front.pos < 1) return;
  const target = world.entityAt(belt.x + DX[belt.dir], belt.y + DY[belt.dir]);
  if (target && canAccept(world, target, front.kind, belt.dir)) {
    items.shift();
    receive(world, target, front, belt.dir);
  }
}

/** Junção: cada item atravessa em linha reta, então duas esteiras podem se cruzar. */
function stepJunction(world: World, junction: Entity): void {
  const lastPos: (number | undefined)[] = [undefined, undefined, undefined, undefined];
  const fronts: (BeltItem | undefined)[] = [undefined, undefined, undefined, undefined];
  for (const item of junction.belt) {
    item.pwx = item.wx;
    item.pwy = item.wy;
    const ahead = lastPos[item.dir];
    const limit = ahead === undefined ? 1 : ahead - BELT_SPACING;
    item.pos = Math.min(item.pos + BELT_SPEED, Math.max(limit, item.pos));
    lastPos[item.dir] = item.pos;
    fronts[item.dir] ??= item;
    placeAlong(junction, item, item.dir);
  }
  for (const front of fronts) {
    if (!front || front.pos < 1) continue;
    const target = world.entityAt(junction.x + DX[front.dir], junction.y + DY[front.dir]);
    if (target && canAccept(world, target, front.kind, front.dir)) {
      junction.belt.splice(junction.belt.indexOf(front), 1);
      receive(world, target, front, front.dir);
    }
  }
}

/** Roteador: reparte os itens, em revezamento, entre as saídas que aceitarem (nunca devolve à origem). */
function stepRouter(world: World, router: Entity): void {
  const item = router.belt[0];
  if (!item) return;
  item.pwx = item.wx;
  item.pwy = item.wy;
  for (let k = 0; k < 4; k++) {
    const dir = ((router.outCursor + k) % 4) as Dir;
    if (dir === oppositeDir(item.dir)) continue;
    const target = world.entityAt(router.x + DX[dir], router.y + DY[dir]);
    if (target && canAccept(world, target, item.kind, dir)) {
      router.belt.shift();
      router.outCursor = (dir + 1) % 4;
      receive(world, target, item, dir);
      return;
    }
  }
}

function stepMiner(world: World, miner: Entity): void {
  if (miner.outCount === 0 && miner.ore) {
    miner.progress += miner.oreCount * world.minerRate * tierBoost(miner.mk);
    if (miner.progress >= MINER_CYCLE) {
      miner.progress -= MINER_CYCLE;
      miner.outItem = miner.ore;
      miner.outCount = 1;
    }
  }
  pushOutput(world, miner);
}

function hasInputs(entity: Entity, recipe: Recipe): boolean {
  return Object.entries(recipe.inputs).every(([item, count]) => (entity.inputs[item as ItemId] ?? 0) >= count);
}

function stepCrafter(world: World, entity: Entity): void {
  const recipe = currentRecipe(entity);
  if (recipe) {
    const hasRoom = entity.outCount + recipe.outputCount <= OUTPUT_CAP;
    if (entity.crafting) {
      entity.progress += (CRAFT_SPEED[entity.kind] ?? 1) * tierBoost(entity.mk);
      if (entity.progress >= recipe.ticks && hasRoom) {
        entity.outItem = recipe.output;
        entity.outCount += recipe.outputCount;
        entity.crafting = false;
      }
    } else if (hasRoom && (entity.outCount === 0 || entity.outItem === recipe.output) && hasInputs(entity, recipe)) {
      for (const [item, count] of Object.entries(recipe.inputs)) entity.inputs[item as ItemId]! -= count;
      entity.crafting = true;
      entity.progress = 0;
    }
  }
  pushOutput(world, entity);
  // Fornalha ociosa libera a receita para aceitar outro minério.
  if (entity.kind === 'furnace' && !entity.crafting && Object.values(entity.inputs).every((n) => !n)) {
    entity.recipeId = undefined;
  }
}

export function stepEntity(world: World, entity: Entity): void {
  switch (entity.kind) {
    case 'conveyor':
      return stepConveyor(world, entity);
    case 'junction':
      return stepJunction(world, entity);
    case 'router':
      return stepRouter(world, entity);
    case 'miner':
      return stepMiner(world, entity);
    case 'furnace':
    case 'assembler':
      return stepCrafter(world, entity);
  }
}

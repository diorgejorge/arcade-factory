import {
  BUILDING_LABEL,
  BUILDING_ORDER,
  buildCost,
  ITEM_IDS,
  ITEM_LABEL,
  ITEM_VALUE,
  RECIPES,
  RECIPE_LABEL,
  removalCost,
  TECHS,
  TIERED_KINDS,
  TIER_BONUS,
} from '../engine/data';
import { TICK_RATE, type Game } from '../engine/sim';
import type { BuildingKind, Entity } from '../engine/types';
import { el, syncSection, type Child } from './dom';
import { iconFor } from './sprites';

export interface UiState {
  tool: BuildingKind | null;
  selected: Entity | null;
  /** Versão (Mk) usada ao construir máquinas. */
  mk: number;
}

export interface UiActions {
  selectTool(kind: BuildingKind | null): void;
  toggleTree(): void;
  toggleCatalog(): void;
}

const DEFAULT_HINT = 'Botão esquerdo: construir · direito: remover · WASD: mover · roda: zoom · R: girar · Q: cancelar';

function formatTime(ticks: number): string {
  const seconds = Math.floor(ticks / TICK_RATE);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function createUi(game: Game, state: UiState, actions: UiActions) {
  const hud = document.getElementById('hud')!;
  const toolbar = document.getElementById('toolbar')!;
  const side = document.getElementById('side')!;
  const hintBar = document.getElementById('hint')!;

  const scoreValue = el('b');
  const timeValue = el('span');
  const catalogButton = el('button', '', 'Construções (B)');
  const treeButton = el('button', '', 'Tecnologias (T)');
  catalogButton.onclick = actions.toggleCatalog;
  treeButton.onclick = actions.toggleTree;
  hud.append(el('span', '', 'Pontos ', scoreValue), el('span', '', 'Tempo ', timeValue), catalogButton, treeButton);

  const inventorySection = el('section');
  const researchSection = el('section');
  const selectionSection = el('section');
  side.append(inventorySection, researchSection, selectionSection);

  let hintTimer = 0;
  const showHint = (text: string) => {
    hintBar.textContent = text;
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => (hintBar.textContent = DEFAULT_HINT), 2500);
  };
  hintBar.textContent = DEFAULT_HINT;

  function buildToolbar(): Child[] {
    const tools: Child[] = BUILDING_ORDER.map((kind, index) => {
      const unlocked = game.isBuildingUnlocked(kind);
      const button = el('button', `tool${state.tool === kind ? ' active' : ''}`, iconFor(kind), el('span', '', unlocked ? BUILDING_LABEL[kind] : `🔒 ${BUILDING_LABEL[kind]}`), el('small', 'price', `−${buildCost(kind, state.mk)}`), el('kbd', '', String(index + 1)));
      button.disabled = !unlocked;
      button.onclick = () => actions.selectTool(state.tool === kind ? null : kind);
      return button;
    });
    if (game.machineTier > 1) {
      const versions = Array.from({ length: game.machineTier }, (_, i) => {
        const mk = i + 1;
        const button = el('button', mk === state.mk ? 'active' : '', `Mk${mk}`);
        button.title = `+${Math.round(TIER_BONUS * (mk - 1) * 100)}% de desempenho`;
        button.onclick = () => (state.mk = mk);
        return button;
      });
      tools.push(el('div', 'muted', 'Versão'), el('div', 'versions', ...versions));
    }
    return tools;
  }

  function buildInventory(): Child[] {
    const rows = ITEM_IDS.filter((item) => game.inventory[item] > 0).map((item) =>
      el('div', 'row', el('span', '', ITEM_LABEL[item]), el('span', 'muted', `${game.inventory[item]} · ${ITEM_VALUE[item]} pts`)),
    );
    return [el('h3', '', 'Entregues na Central'), ...(rows.length ? rows : [el('div', 'muted', 'Entregue itens na Central.')])];
  }

  function buildResearchSummary(): Child[] {
    return [el('h3', '', 'Tecnologias'), el('div', 'muted', `${game.researched.size}/${TECHS.length} pesquisadas · Máquinas Mk${game.machineTier}`), el('div', 'muted', 'Abra a árvore (T) para pesquisar.')];
  }

  function buildSelection(): Child[] {
    const entity = state.selected;
    if (!entity) return [];
    const nodes: Child[] = [el('h3', '', BUILDING_LABEL[entity.kind])];
    if (entity.kind === 'assembler') {
      const select = el('select');
      Object.values(RECIPES)
        .filter((recipe) => recipe.machine === 'assembler' && game.isRecipeUnlocked(recipe.id))
        .forEach((recipe) => select.append(new Option(RECIPE_LABEL[recipe.id], recipe.id, false, recipe.id === entity.recipeId)));
      select.onchange = () => game.setRecipe(entity.x, entity.y, select.value);
      nodes.push(el('div', 'muted', 'Receita'), select);
    } else {
      nodes.push(el('div', 'muted', 'R gira a máquina.'));
    }
    if (TIERED_KINDS.includes(entity.kind)) nodes.push(el('div', 'muted', `Mk${entity.mk}: +${Math.round(TIER_BONUS * (entity.mk - 1) * 100)}% de desempenho`));
    nodes.push(el('div', 'muted', `Remover custa ${removalCost(entity.kind, entity.mk)} pontos.`));
    return nodes;
  }

  function refresh(): void {
    scoreValue.textContent = Math.floor(game.score).toLocaleString('pt-BR');
    scoreValue.classList.toggle('neg', game.score < 0);
    timeValue.textContent = formatTime(game.tick);

    syncSection(toolbar, `${state.tool}|${state.mk}|${game.machineTier}|${BUILDING_ORDER.map((k) => +game.isBuildingUnlocked(k)).join('')}`, buildToolbar);
    syncSection(inventorySection, JSON.stringify(game.inventory), buildInventory);
    syncSection(researchSection, `${game.researched.size}|${game.machineTier}`, buildResearchSummary);
    const e = state.selected;
    syncSection(selectionSection, e ? `${e.id}|${e.mk}|${e.recipeId}|${game.researched.size}` : 'none', buildSelection);
  }

  return { refresh, showHint };
}

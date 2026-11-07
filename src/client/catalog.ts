import {
  BUILDING_INFO,
  BUILDING_LABEL,
  BUILDING_ORDER,
  BUILDING_SIZE,
  buildCost,
  ITEM_LABEL,
  MAX_TIER,
  RECIPES,
  RECIPE_LABEL,
  removalCost,
  TIER_BONUS,
  TIERED_KINDS,
  tierCost,
  unlockingTech,
} from '../engine/data';
import type { Game } from '../engine/sim';
import type { BuildingKind } from '../engine/types';
import { el, formatNumber, type Child } from './dom';
import { iconFor } from './sprites';
import type { UiState } from './ui';

export interface CatalogActions {
  /** Escolhe a construção e a versão e fecha o catálogo para o jogador posicionar. */
  pick(kind: BuildingKind, mk: number): void;
  openTree(): void;
}

/** Catálogo de construções: lista os tipos e, de cada um, tamanho, receitas e as opções (versões Mk) com preços. */
export function createCatalog(game: Game, state: UiState, actions: CatalogActions) {
  const root = document.getElementById('catalog')!;
  let selected: BuildingKind = 'miner';
  let signature = '';

  const nav = el('div', 'catalog-nav');
  const detail = el('div', 'catalog-detail');
  const scoreText = el('b');
  const closeButton = el('button', 'close', '✕');
  root.append(el('div', 'modal-box', el('div', 'modal-head', el('h2', '', 'Construções'), el('span', '', 'Pontos ', scoreText), el('span', 'grow'), closeButton), el('div', 'catalog-body', nav, detail)));

  const recipesOf = (kind: BuildingKind) => Object.values(RECIPES).filter((recipe) => recipe.machine === kind && game.isRecipeUnlocked(recipe.id));

  function buildNav(): Child[] {
    return BUILDING_ORDER.map((kind) => {
      const unlocked = game.isBuildingUnlocked(kind);
      const size = BUILDING_SIZE[kind];
      const button = el('button', `tool${kind === selected ? ' active' : ''}`, iconFor(kind), el('span', '', unlocked ? BUILDING_LABEL[kind] : `🔒 ${BUILDING_LABEL[kind]}`), el('small', 'price', `${size}×${size}`));
      button.onclick = () => { selected = kind; signature = ''; refresh(); };
      return button;
    });
  }

  function optionRow(kind: BuildingKind, mk: number, unlocked: boolean): HTMLElement {
    const tiered = TIERED_KINDS.includes(kind);
    const chosen = state.tool === kind && state.mk === mk;
    const button = el('button', '', chosen ? 'Selecionada' : 'Construir');
    button.disabled = !unlocked;
    button.onclick = () => actions.pick(kind, mk);
    return el('tr', chosen ? 'sel' : '', el('td', '', tiered ? `Mk${mk}` : 'Padrão'), el('td', '', tiered ? (mk === 1 ? 'base' : `+${Math.round(TIER_BONUS * (mk - 1) * 100)}%`) : '—'), el('td', '', `−${formatNumber(buildCost(kind, mk))}`), el('td', '', `−${formatNumber(removalCost(kind, mk))}`), el('td', '', button));
  }

  function buildDetail(): Child[] {
    const kind = selected;
    const unlocked = game.isBuildingUnlocked(kind);
    const size = BUILDING_SIZE[kind];
    const out: Child[] = [el('h3', '', BUILDING_LABEL[kind]), el('p', '', BUILDING_INFO[kind]), el('div', 'muted', `Ocupa ${size}×${size} tiles.`)];

    if (!unlocked) {
      const tech = unlockingTech(kind);
      const open = el('button', '', 'Abrir árvore');
      open.onclick = actions.openTree;
      out.push(el('div', 'locked-note', `🔒 Bloqueada. Pesquise ${tech ? `“${tech.name}”` : 'a tecnologia que a libera'}.`), open);
    }

    if (kind === 'furnace' || kind === 'assembler') {
      const recipes = recipesOf(kind);
      out.push(el('h3', '', 'Receitas liberadas'));
      out.push(...(recipes.length
        ? recipes.map((recipe) => el('div', 'muted', `${RECIPE_LABEL[recipe.id]}: ${Object.entries(recipe.inputs).map(([item, count]) => `${count} ${ITEM_LABEL[item as keyof typeof ITEM_LABEL]}`).join(' + ')} → ${recipe.outputCount} ${ITEM_LABEL[recipe.output]}`))
        : [el('div', 'muted', 'Nenhuma ainda.')]));
    }

    const versions = TIERED_KINDS.includes(kind) ? Array.from({ length: game.machineTier }, (_, i) => i + 1) : [1];
    out.push(
      el('h3', '', 'Opções'),
      el('table', 'opts', el('thead', '', el('tr', '', ...['Versão', 'Desempenho', 'Construir', 'Remover', ''].map((label) => el('th', '', label)))), el('tbody', '', ...versions.map((mk) => optionRow(kind, mk, unlocked)))),
    );
    if (TIERED_KINDS.includes(kind) && game.machineTier < MAX_TIER) {
      const next = game.machineTier + 1;
      const open = el('button', '', 'Abrir árvore');
      open.onclick = actions.openTree;
      out.push(el('div', 'muted', `Próxima versão: Mk${next} (+${Math.round(TIER_BONUS * (next - 1) * 100)}%), pesquisa de ${formatNumber(tierCost(next))} pontos.`), open);
    }
    return out;
  }

  function refresh(): void {
    if (root.hidden) return;
    scoreText.textContent = formatNumber(Math.floor(game.score));
    scoreText.classList.toggle('neg', game.score < 0);
    const unlockedFlags = BUILDING_ORDER.map((kind) => +game.isBuildingUnlocked(kind)).join('');
    const next = `${selected}|${unlockedFlags}|${game.machineTier}|${state.tool}|${state.mk}|${recipesOf('furnace').length}${recipesOf('assembler').length}`;
    if (next === signature) return;
    signature = next;
    nav.replaceChildren(...buildNav());
    detail.replaceChildren(...buildDetail());
  }

  const close = () => { root.hidden = true; };
  const open = () => { if (state.tool) selected = state.tool; root.hidden = false; signature = ''; refresh(); };
  closeButton.onclick = close;
  root.onclick = (event) => { if (event.target === root) close(); };

  return { open, close, toggle: () => (root.hidden ? open() : close()), isOpen: () => !root.hidden, refresh };
}

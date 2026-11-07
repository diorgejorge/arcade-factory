import type { TreeNode } from '../engine/data';

export interface LayoutOptions {
  nodeW: number;
  nodeH: number;
  gapX: number;
  gapY: number;
}

export interface Layout {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}

/**
 * Posiciona os nós em colunas pela profundidade (caminho mais longo até a raiz), de modo que toda seta
 * vá da esquerda para a direita; dentro da coluna ordena pela posição média dos requisitos (menos cruzamentos).
 */
export function layoutGraph(nodes: readonly TreeNode[], { nodeW, nodeH, gapX, gapY }: LayoutOptions): Layout {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depths = new Map<string, number>();
  const depthOf = (id: string): number => {
    if (!depths.has(id)) depths.set(id, byId.get(id)!.requires.length ? 1 + Math.max(...byId.get(id)!.requires.map(depthOf)) : 0);
    return depths.get(id)!;
  };
  const columns: string[][] = [];
  for (const node of nodes) (columns[depthOf(node.id)] ??= []).push(node.id);

  const row = new Map<string, number>();
  columns.forEach((column) => {
    const score = (id: string) => {
      const parents = byId.get(id)!.requires;
      return parents.length ? parents.reduce((sum, parent) => sum + row.get(parent)!, 0) / parents.length : 0;
    };
    column.sort((a, b) => score(a) - score(b));
    column.forEach((id, index) => row.set(id, index));
  });

  const tallest = Math.max(...columns.map((column) => column.length));
  const positions = new Map<string, { x: number; y: number }>();
  columns.forEach((column, depth) => {
    const offset = ((tallest - column.length) * (nodeH + gapY)) / 2;
    column.forEach((id, index) => positions.set(id, { x: depth * (nodeW + gapX), y: offset + index * (nodeH + gapY) }));
  });
  return { positions, width: columns.length * (nodeW + gapX) - gapX, height: tallest * (nodeH + gapY) - gapY };
}

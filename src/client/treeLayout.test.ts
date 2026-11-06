import { describe, expect, it } from 'vitest';
import { MAX_TIER, TECHS, TECH_GRAPH, tierRequires } from '../engine/data';
import { layoutGraph } from './treeLayout';

const OPTIONS = { nodeW: 170, nodeH: 96, gapX: 56, gapY: 16 };

describe('grafo da árvore', () => {
  const ids = new Set(TECH_GRAPH.map((node) => node.id));

  it('tem as tecnologias e uma versão Mk de 2 até o máximo, sem ids repetidos', () => {
    expect(TECH_GRAPH.length).toBe(TECHS.length + MAX_TIER - 1);
    expect(ids.size).toBe(TECH_GRAPH.length);
  });

  it('toda ligação aponta para um nó existente', () => {
    for (const node of TECH_GRAPH) for (const parent of node.requires) expect(ids.has(parent), `${node.id} -> ${parent}`).toBe(true);
  });

  it('cada versão exige a anterior mais as tecnologias da própria versão', () => {
    for (const node of TECH_GRAPH.filter((n) => n.tier)) {
      const expected = [...(node.tier! > 2 ? [`mk${node.tier! - 1}`] : []), ...tierRequires(node.tier!)];
      expect(node.requires).toEqual(expected);
    }
  });
});

describe('layout da árvore', () => {
  const layout = layoutGraph(TECH_GRAPH, OPTIONS);
  const at = (id: string) => layout.positions.get(id)!;

  it('posiciona todos os nós', () => {
    expect(layout.positions.size).toBe(TECH_GRAPH.length);
  });

  it('toda seta vai da esquerda para a direita', () => {
    for (const node of TECH_GRAPH) for (const parent of node.requires) expect(at(parent).x, `${parent} -> ${node.id}`).toBeLessThan(at(node.id).x);
  });

  it('nenhum nó se sobrepõe a outro e todos cabem na área', () => {
    const boxes = [...layout.positions.values()];
    for (const [i, a] of boxes.entries()) {
      expect(a.x + OPTIONS.nodeW).toBeLessThanOrEqual(layout.width);
      expect(a.y + OPTIONS.nodeH).toBeLessThanOrEqual(layout.height);
      for (const b of boxes.slice(i + 1)) {
        const overlaps = a.x < b.x + OPTIONS.nodeW && b.x < a.x + OPTIONS.nodeW && a.y < b.y + OPTIONS.nodeH && b.y < a.y + OPTIONS.nodeH;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('a raiz fica na primeira coluna', () => {
    expect(at('smelting').x).toBe(0);
  });
});

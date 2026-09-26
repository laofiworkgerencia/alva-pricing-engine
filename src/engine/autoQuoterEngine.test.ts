import { describe, expect, it } from 'vitest';
import { suggestAssignments } from './autoQuoterEngine';
import type { WbsNode } from './types';

function node(overrides: Partial<WbsNode>): WbsNode {
  return {
    id: 'n1',
    code: '1.1.1.01',
    name: 'Tarea',
    levelType: 'Tarea',
    parentId: null,
    isActive: true,
    startDay: 1,
    duration: 10,
    ...overrides,
  };
}

describe('suggestAssignments', () => {
  it('sugiere Especialista SIG cuando la descripción menciona geodatabase', () => {
    const n = node({ descTecnica: 'Análisis SIG de capas catastrales y geodatabase.' });
    const suggestions = suggestAssignments([n]);
    expect(suggestions.some((s) => s.resourceName === 'Especialista SIG')).toBe(true);
  });

  it('sugiere Piloto VANT ante menciones de dron/fotogrametría', () => {
    const n = node({ descGeneral: 'Vuelo con dron para fotogrametría del predio.' });
    const suggestions = suggestAssignments([n]);
    expect(suggestions.some((s) => s.resourceName === 'Piloto VANT + Dron VANT PPK')).toBe(true);
  });

  it('detecta keywords sin distinguir acentos ni mayúsculas', () => {
    const n = node({ descSmart: 'LEVANTAMIENTO topografico con estacion total.' });
    const suggestions = suggestAssignments([n]);
    expect(suggestions.some((s) => s.resourceName === 'Topógrafo')).toBe(true);
  });

  it('regla de oro: toda Fase recibe un Director de Proyecto PMP con tiempo = duración/30 meses', () => {
    const n = node({ levelType: 'Fase', duration: 90, descGeneral: 'Sin keywords relevantes.' });
    const suggestions = suggestAssignments([n]);
    const pm = suggestions.find((s) => s.resourceName === 'Director de Proyecto PMP');
    expect(pm).toBeDefined();
    expect(pm?.timeMonths).toBeCloseTo(3, 5);
  });

  it('el Director de Proyecto nunca baja de 0.1 meses aunque la fase sea muy corta', () => {
    const n = node({ levelType: 'Fase', duration: 1 });
    const suggestions = suggestAssignments([n]);
    const pm = suggestions.find((s) => s.resourceName === 'Director de Proyecto PMP');
    expect(pm?.timeMonths).toBeCloseTo(0.1, 5);
  });

  it('no sugiere nada si no hay keywords y el nodo no es una Fase', () => {
    const n = node({ descGeneral: 'Texto genérico sin ninguna palabra clave relevante.' });
    expect(suggestAssignments([n])).toHaveLength(0);
  });
});

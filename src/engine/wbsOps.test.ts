import { describe, expect, it } from 'vitest';
import {
  addWbsNode,
  findWbsIdByCode,
  removeWbsNode,
  resolveParentIdFromCode,
  updateWbsNode,
} from './wbsOps';
import type { ProjectData } from './types';

function emptyProject(): ProjectData {
  return {
    version: '1.0',
    categorias: {},
    rubrosPrincipales: {},
    rubrosSecundarios: {},
    rubrosDetallados: {},
    tarifas: {},
    elementosWbs: {},
    recursosWbs: {},
    ofertaComercial: {
      version: '1.0', clientName: '', projectName: '', projectNameFull: '', sbu: 482, date: '',
      quoteType: 'economic', maxDetailLevel: 4, introText: '', discountType: 'none', discountValue: 0,
      quoteSequence: '', targetBudget: 0, globalInsurance: 0, globalContingency: 0, globalProfit: 35,
      milestones: [],
    },
    narrativa: {},
  };
}

describe('addWbsNode / updateWbsNode', () => {
  it('agrega un nodo y permite editarlo', () => {
    let p = emptyProject();
    p = addWbsNode(p, {
      code: '1', name: 'Fase 1', levelType: 'Fase', parentId: null, isActive: true, startDay: 1, duration: 10,
    }, 'f1');
    expect(p.elementosWbs.f1.name).toBe('Fase 1');

    p = updateWbsNode(p, 'f1', { name: 'Fase 1 renombrada', duration: 20 });
    expect(p.elementosWbs.f1.name).toBe('Fase 1 renombrada');
    expect(p.elementosWbs.f1.duration).toBe(20);
    expect(p.elementosWbs.f1.code).toBe('1');
  });

  it('updateWbsNode sobre un id inexistente no hace nada', () => {
    const p = emptyProject();
    expect(updateWbsNode(p, 'no-existe', { name: 'x' })).toEqual(p);
  });
});

describe('removeWbsNode', () => {
  function buildTree() {
    let p = emptyProject();
    p = addWbsNode(p, { code: '1', name: 'Fase', levelType: 'Fase', parentId: null, isActive: true, startDay: 1, duration: 30 }, 'f1');
    p = addWbsNode(p, { code: '1.1', name: 'Act', levelType: 'Actividad', parentId: 'f1', isActive: true, startDay: 1, duration: 30 }, 'a1');
    p = addWbsNode(p, { code: '1.1.1', name: 'Tarea', levelType: 'Tarea', parentId: 'a1', isActive: true, startDay: 1, duration: 10 }, 't1');
    p = { ...p, recursosWbs: { r1: { id: 'r1', elementoWbsId: 't1', tarifaId: 'tar-x', quantity: 1, quantityUnit: 'Persona', time: 1, timeUnit: 'Mes' } } };
    return p;
  }

  it('elimina el nodo y en cascada sus descendientes y asignaciones', () => {
    const p = buildTree();
    const next = removeWbsNode(p, 'f1');
    expect(next.elementosWbs.f1).toBeUndefined();
    expect(next.elementosWbs.a1).toBeUndefined();
    expect(next.elementosWbs.t1).toBeUndefined();
    expect(next.recursosWbs.r1).toBeUndefined();
  });

  it('eliminar una hoja no afecta a sus hermanos ni ancestros', () => {
    const p = buildTree();
    const next = removeWbsNode(p, 't1');
    expect(next.elementosWbs.t1).toBeUndefined();
    expect(next.recursosWbs.r1).toBeUndefined();
    expect(next.elementosWbs.f1).toBeDefined();
    expect(next.elementosWbs.a1).toBeDefined();
  });
});

describe('findWbsIdByCode / resolveParentIdFromCode', () => {
  it('encuentra el id por código y resuelve el padre por prefijo', () => {
    let p = emptyProject();
    p = addWbsNode(p, { code: '1', name: 'Fase', levelType: 'Fase', parentId: null, isActive: true, startDay: 1, duration: 10 }, 'f1');
    p = addWbsNode(p, { code: '1.1', name: 'Act', levelType: 'Actividad', parentId: 'f1', isActive: true, startDay: 1, duration: 10 }, 'a1');

    expect(findWbsIdByCode(p, '1.1')).toBe('a1');
    expect(findWbsIdByCode(p, 'no-existe')).toBeNull();
    expect(resolveParentIdFromCode(p, '1.1.1')).toBe('a1');
    expect(resolveParentIdFromCode(p, '1')).toBeNull();
  });
});

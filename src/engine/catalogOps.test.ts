import { describe, expect, it } from 'vitest';
import {
  addAssignment,
  addRubroDetallado,
  addRubroSecundario,
  addTarifa,
  removeAssignment,
  removeRubroDetallado,
  removeRubroSecundario,
  removeTarifa,
  renameRubroSecundario,
  updateAssignment,
  updateRubroDetallado,
  updateTarifa,
} from './catalogOps';
import type { ProjectData } from './types';

function emptyProject(): ProjectData {
  return {
    version: '1.0',
    categorias: { 'n1-1': { id: 'n1-1', name: '1. COSTOS DIRECTOS' } },
    rubrosPrincipales: { 'n2-1': { id: 'n2-1', parentId: 'n1-1', name: '1. Remuneraciones' } },
    rubrosSecundarios: {},
    rubrosDetallados: {},
    tarifas: {},
    elementosWbs: {
      w1: { id: 'w1', code: '1', name: 'Fase 1', levelType: 'Fase', parentId: null, isActive: true, startDay: 1, duration: 10 },
    },
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

describe('cadena N3 → N4 → N5 → asignación', () => {
  it('se puede construir de arriba hacia abajo', () => {
    let p = emptyProject();
    p = addRubroSecundario(p, 'n2-1', 'Honorarios Factura');
    const secId = Object.keys(p.rubrosSecundarios)[0];
    expect(p.rubrosSecundarios[secId].name).toBe('Honorarios Factura');

    p = addRubroDetallado(p, secId, 'Especialista SIG', 'Análisis espacial.');
    const detId = Object.keys(p.rubrosDetallados)[0];
    expect(p.rubrosDetallados[detId].parentId).toBe(secId);

    p = addTarifa(p, detId, 'Nómina ALVA', 1500, 'Mes');
    const tarId = Object.keys(p.tarifas)[0];
    expect(p.tarifas[tarId].unitCost).toBe(1500);

    p = addAssignment(p, {
      elementoWbsId: 'w1', tarifaId: tarId, quantity: 1, quantityUnit: 'Persona', time: 1, timeUnit: 'Mes',
    });
    const assignmentId = Object.keys(p.recursosWbs)[0];
    expect(p.recursosWbs[assignmentId].tarifaId).toBe(tarId);
  });

  it('acepta un id explícito para encadenar creaciones sin diff posterior (usado por aiCommands)', () => {
    let p = emptyProject();
    p = addRubroSecundario(p, 'n2-1', 'Sec', 'sec-fixed');
    p = addRubroDetallado(p, 'sec-fixed', 'Det', '', 'det-fixed');
    p = addTarifa(p, 'det-fixed', 'Prov', 100, 'Mes', 'tar-fixed');
    expect(p.rubrosSecundarios['sec-fixed'].name).toBe('Sec');
    expect(p.rubrosDetallados['det-fixed'].parentId).toBe('sec-fixed');
    expect(p.tarifas['tar-fixed'].parentId).toBe('det-fixed');
  });

  it('renombrar/editar no afecta otros registros', () => {
    let p = emptyProject();
    p = addRubroSecundario(p, 'n2-1', 'Original');
    const secId = Object.keys(p.rubrosSecundarios)[0];
    p = renameRubroSecundario(p, secId, 'Renombrado');
    expect(p.rubrosSecundarios[secId].name).toBe('Renombrado');

    p = addRubroDetallado(p, secId, 'Item', '');
    const detId = Object.keys(p.rubrosDetallados)[0];
    p = updateRubroDetallado(p, detId, { description: 'Nueva descripción' });
    expect(p.rubrosDetallados[detId].description).toBe('Nueva descripción');

    p = addTarifa(p, detId, 'Proveedor A', 100, 'Mes');
    const tarId = Object.keys(p.tarifas)[0];
    p = updateTarifa(p, tarId, { unitCost: 200 });
    expect(p.tarifas[tarId].unitCost).toBe(200);
  });
});

describe('borrado en cascada', () => {
  function buildChain() {
    let p = emptyProject();
    p = addRubroSecundario(p, 'n2-1', 'Sec');
    const secId = Object.keys(p.rubrosSecundarios)[0];
    p = addRubroDetallado(p, secId, 'Det', '');
    const detId = Object.keys(p.rubrosDetallados)[0];
    p = addTarifa(p, detId, 'Prov', 100, 'Mes');
    const tarId = Object.keys(p.tarifas)[0];
    p = addAssignment(p, {
      elementoWbsId: 'w1', tarifaId: tarId, quantity: 1, quantityUnit: 'Persona', time: 1, timeUnit: 'Mes',
    });
    const assignmentId = Object.keys(p.recursosWbs)[0];
    return { p, secId, detId, tarId, assignmentId };
  }

  it('eliminar una Tarifa elimina las asignaciones que la usan', () => {
    const { p, tarId, assignmentId } = buildChain();
    const next = removeTarifa(p, tarId);
    expect(next.tarifas[tarId]).toBeUndefined();
    expect(next.recursosWbs[assignmentId]).toBeUndefined();
  });

  it('eliminar un Rubro Detallado elimina sus Tarifas y las asignaciones asociadas', () => {
    const { p, detId, tarId, assignmentId } = buildChain();
    const next = removeRubroDetallado(p, detId);
    expect(next.rubrosDetallados[detId]).toBeUndefined();
    expect(next.tarifas[tarId]).toBeUndefined();
    expect(next.recursosWbs[assignmentId]).toBeUndefined();
  });

  it('eliminar un Rubro Secundario elimina toda la cadena N4 → N5 → asignación', () => {
    const { p, secId, detId, tarId, assignmentId } = buildChain();
    const next = removeRubroSecundario(p, secId);
    expect(next.rubrosSecundarios[secId]).toBeUndefined();
    expect(next.rubrosDetallados[detId]).toBeUndefined();
    expect(next.tarifas[tarId]).toBeUndefined();
    expect(next.recursosWbs[assignmentId]).toBeUndefined();
  });

  it('eliminar una asignación no afecta el catálogo', () => {
    const { p, secId, detId, tarId, assignmentId } = buildChain();
    const next = removeAssignment(p, assignmentId);
    expect(next.recursosWbs[assignmentId]).toBeUndefined();
    expect(next.tarifas[tarId]).toBeDefined();
    expect(next.rubrosDetallados[detId]).toBeDefined();
    expect(next.rubrosSecundarios[secId]).toBeDefined();
  });

  it('actualizar una asignación conserva el resto de sus campos', () => {
    const { p, assignmentId } = buildChain();
    const next = updateAssignment(p, assignmentId, { quantity: 3 });
    expect(next.recursosWbs[assignmentId].quantity).toBe(3);
    expect(next.recursosWbs[assignmentId].timeUnit).toBe('Mes');
  });
});

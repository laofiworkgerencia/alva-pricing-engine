import { describe, expect, it } from 'vitest';
import { calculate } from './pricingEngine';
import { buildClassicProposalLines, buildClassicProposalMilestones, getWbsLevel } from './classicProposal';
import type { Catalog, ProjectData, ResourceAssignment, WbsNode } from './types';

function buildProject(): ProjectData {
  const elementosWbs: Record<string, WbsNode> = {
    f1: {
      id: 'f1',
      code: '1',
      name: 'Fase 1',
      levelType: 'Fase',
      parentId: null,
      isActive: true,
      startDay: 1,
      duration: 20,
      deliverable: 'Plan | Cronograma',
      descGeneral: 'Planificación general.',
    },
    t1: {
      id: 't1',
      code: '1.1',
      name: 'Tarea 1.1',
      levelType: 'Actividad',
      parentId: 'f1',
      isActive: true,
      startDay: 1,
      duration: 10,
    },
    t2: {
      id: 't2',
      code: '1.1.1',
      name: 'Tarea 1.1.1 (nivel 3)',
      levelType: 'Acción',
      parentId: 't1',
      isActive: true,
      startDay: 1,
      duration: 5,
    },
    inactive: {
      id: 'inactive',
      code: '1.2',
      name: 'Tarea inactiva',
      levelType: 'Actividad',
      parentId: 'f1',
      isActive: false,
      startDay: 1,
      duration: 5,
    },
  };

  const recursosWbs: Record<string, ResourceAssignment> = {
    r1: {
      id: 'r1',
      elementoWbsId: 't1',
      tarifaId: 'tar-1',
      quantity: 1,
      quantityUnit: 'Persona',
      time: 10,
      timeUnit: 'Día',
    },
  };

  const catalog: Catalog = {
    categorias: { 'n1-1': { id: 'n1-1', name: '1. COSTOS DIRECTOS' } },
    rubrosPrincipales: { 'n2-1': { id: 'n2-1', parentId: 'n1-1', name: '1. Remuneraciones' } },
    rubrosSecundarios: { 'sec-1': { id: 'sec-1', parentId: 'n2-1', name: 'Honorarios' } },
    rubrosDetallados: { 'det-1': { id: 'det-1', parentId: 'sec-1', name: 'Consultor' } },
    tarifas: { 'tar-1': { id: 'tar-1', parentId: 'det-1', supplier: 'X', unitCost: 100, unit: 'Día' } },
  };

  return {
    version: '14.8',
    ...catalog,
    elementosWbs,
    recursosWbs,
    ofertaComercial: {
      version: '14.8',
      clientName: 'Cliente Ejemplo',
      projectName: 'Proyecto Ejemplo',
      projectNameFull: 'Proyecto Ejemplo Completo',
      sbu: 482,
      date: '2026-01-01',
      quoteType: 'economic',
      maxDetailLevel: 2,
      introText: 'Intro',
      discountType: 'none',
      discountValue: 0,
      quoteSequence: 'COT-TEST',
      targetBudget: 0,
      globalInsurance: 0,
      globalContingency: 0,
      globalProfit: 0,
      milestones: [
        { id: 'm1', name: 'Anticipo', percentage: 50, linkedWbsId: 't1' },
        { id: 'm2', name: 'Final', percentage: 50, linkedWbsId: 'no-existe' },
      ],
    },
    narrativa: {},
  };
}

describe('buildClassicProposalLines', () => {
  it('filtra por isActive y maxDetailLevel (filtro plano, no poda de subárbol)', () => {
    const project = buildProject();
    const result = calculate(
      project.elementosWbs,
      project.recursosWbs,
      project,
      project.ofertaComercial
    );
    const lines = buildClassicProposalLines(project, result);
    const ids = lines.map((l) => l.id);

    // maxDetailLevel=2: entra f1 (nivel 1) y t1 (nivel 2), no t2 (nivel 3).
    expect(ids).toContain('f1');
    expect(ids).toContain('t1');
    expect(ids).not.toContain('t2');
    // inactivo se excluye aunque su nivel califique.
    expect(ids).not.toContain('inactive');
  });

  it('calcula el costo y separa los entregables por " | "', () => {
    const project = buildProject();
    const result = calculate(
      project.elementosWbs,
      project.recursosWbs,
      project,
      project.ofertaComercial
    );
    const lines = buildClassicProposalLines(project, result);
    const f1 = lines.find((l) => l.id === 'f1')!;
    expect(f1.deliverables).toEqual(['Plan', 'Cronograma']);
    expect(f1.isRoot).toBe(true);

    const t1 = lines.find((l) => l.id === 't1')!;
    expect(t1.cost).toBe(1000); // 100/día × 10 días
    // t1 no es hoja (tiene a t2 como hija): su schedule es el rollup de sus
    // hojas activas descendientes, no su propio startDay/duration crudo.
    expect(t1.startDay).toBe(1);
    expect(t1.endDay).toBe(5);
  });
});

describe('buildClassicProposalMilestones', () => {
  it('calcula el monto y el día final del nodo vinculado cuando existe', () => {
    const project = buildProject();
    const result = calculate(
      project.elementosWbs,
      project.recursosWbs,
      project,
      project.ofertaComercial
    );
    const milestones = buildClassicProposalMilestones(project, result);

    const m1 = milestones.find((m) => m.id === 'm1')!;
    expect(m1.amount).toBe(500); // 50% de 1000
    expect(m1.linkedNode).toEqual({ code: '1.1', name: 'Tarea 1.1', endDay: 5 });
  });

  it('deja linkedNode indefinido cuando linkedWbsId no existe en el proyecto (referencia rota)', () => {
    const project = buildProject();
    const result = calculate(
      project.elementosWbs,
      project.recursosWbs,
      project,
      project.ofertaComercial
    );
    const milestones = buildClassicProposalMilestones(project, result);
    const m2 = milestones.find((m) => m.id === 'm2')!;
    expect(m2.linkedNode).toBeUndefined();
    expect(m2.amount).toBe(500);
  });
});

describe('getWbsLevel', () => {
  it('cuenta los segmentos separados por punto', () => {
    expect(getWbsLevel('1')).toBe(1);
    expect(getWbsLevel('1.1')).toBe(2);
    expect(getWbsLevel('1.1.1.1')).toBe(4);
  });
});

import { describe, expect, it } from 'vitest';
import {
  calculate,
  calculateAssignmentCost,
  calculateFinancialSummary,
  calculateMilestones,
} from './pricingEngine';
import type { Catalog, OfertaComercial, ResourceAssignment, WbsNode } from './types';

describe('calculateAssignmentCost (ejemplos de SKILL.md §1.4)', () => {
  it('Especialista SIG: $1500/Mes, quantity=1, time=2.5 Mes → $3,750', () => {
    const assignment = {
      quantity: 1,
      time: 2.5,
      timeUnit: 'Mes',
    } as ResourceAssignment;
    expect(calculateAssignmentCost(assignment, 1500, 'Mes')).toBeCloseTo(3750, 5);
  });

  it('Relevador: $45/Día, quantity=18, time=80 Día → $64,800', () => {
    const assignment = {
      quantity: 18,
      time: 80,
      timeUnit: 'Día',
    } as ResourceAssignment;
    expect(calculateAssignmentCost(assignment, 45, 'Día')).toBeCloseTo(64800, 5);
  });

  it('unidades no temporales (Global/Kit) ignoran el tiempo', () => {
    const assignment = {
      quantity: 3,
      time: 999,
      timeUnit: '-',
    } as ResourceAssignment;
    expect(calculateAssignmentCost(assignment, 500, 'Global')).toBe(1500);
  });
});

describe('calculateFinancialSummary', () => {
  it('aplica seguros + imprevistos + utilidad y descuento porcentual', () => {
    const oferta = {
      globalInsurance: 2,
      globalContingency: 5,
      globalProfit: 35,
      discountType: 'percentage',
      discountValue: 10,
    } as OfertaComercial;
    const summary = calculateFinancialSummary(10000, oferta);
    expect(summary.insurance).toBeCloseTo(200, 5);
    expect(summary.contingency).toBeCloseTo(500, 5);
    expect(summary.profit).toBeCloseTo(3500, 5);
    expect(summary.subtotalGross).toBeCloseTo(14200, 5);
    expect(summary.discount).toBeCloseTo(1420, 5);
    expect(summary.total).toBeCloseTo(12780, 5);
  });

  it('con 0% de utilidad no rompe (nullish, no falsy)', () => {
    const oferta = {
      globalInsurance: 0,
      globalContingency: 0,
      globalProfit: 0,
      discountType: 'none',
      discountValue: 0,
    } as OfertaComercial;
    expect(calculateFinancialSummary(1000, oferta).total).toBe(1000);
  });
});

describe('calculateMilestones', () => {
  it('reparte el total según los porcentajes de los hitos', () => {
    const amounts = calculateMilestones(
      [
        { id: 'm1', name: 'Anticipo', percentage: 30 },
        { id: 'm2', name: 'Final', percentage: 70 },
      ],
      1000
    );
    expect(amounts[0].amount).toBeCloseTo(300, 5);
    expect(amounts[1].amount).toBeCloseTo(700, 5);
  });

  it('agrega un warning si los porcentajes no suman 100', () => {
    const warnings: string[] = [];
    calculateMilestones([{ id: 'm1', name: 'Único', percentage: 50 }], 1000, warnings);
    expect(warnings).toHaveLength(1);
  });
});

function buildFixture() {
  const catalog: Catalog = {
    categorias: {
      'n1-1': { id: 'n1-1', name: '1. COSTOS DIRECTOS' },
      'n1-2': { id: 'n1-2', name: '2. COSTOS INDIRECTOS' },
      'n1-3': { id: 'n1-3', name: '3. GASTOS GENERALES' },
      'n1-4': { id: 'n1-4', name: '4. UTILIDAD' },
    },
    rubrosPrincipales: {
      'n2-1': { id: 'n2-1', parentId: 'n1-1', name: '1. Remuneraciones' },
      'n2-10': { id: 'n2-10', parentId: 'n1-2', name: '1. Personal de dirección' },
      'n2-11': { id: 'n2-11', parentId: 'n1-3', name: '1. Gastos varios' },
    },
    rubrosSecundarios: {
      'sec-1': { id: 'sec-1', parentId: 'n2-1', name: 'Honorarios Factura' },
      'sec-2': { id: 'sec-2', parentId: 'n2-10', name: 'Dirección de Proyecto' },
      'sec-3': { id: 'sec-3', parentId: 'n2-11', name: 'Gastos Varios' },
    },
    rubrosDetallados: {
      'det-sig': { id: 'det-sig', parentId: 'sec-1', name: 'Especialista SIG' },
      'det-dig': { id: 'det-dig', parentId: 'sec-1', name: 'Digitador' },
      'det-dir': { id: 'det-dir', parentId: 'sec-2', name: 'Director de Proyecto PMP' },
      'det-gg': { id: 'det-gg', parentId: 'sec-3', name: 'Gastos Generales Varios' },
    },
    tarifas: {
      'tar-sig': { id: 'tar-sig', parentId: 'det-sig', supplier: 'Nómina ALVA', unitCost: 1500, unit: 'Mes' },
      'tar-dig': { id: 'tar-dig', parentId: 'det-dig', supplier: 'Nómina ALVA', unitCost: 800, unit: 'Mes' },
      'tar-dir': { id: 'tar-dir', parentId: 'det-dir', supplier: 'Servicios Profesionales', unitCost: 2000, unit: 'Mes' },
      'tar-gg': { id: 'tar-gg', parentId: 'det-gg', supplier: 'Varios', unitCost: 400, unit: 'Global' },
    },
  };

  const wbsNodes: Record<string, WbsNode> = {
    f1: { id: 'f1', code: '1', name: 'Fase 1', levelType: 'Fase', parentId: null, isActive: true, startDay: 1, duration: 1 },
    t1: { id: 't1', code: '1.1', name: 'Tarea 1', levelType: 'Actividad', parentId: 'f1', isActive: true, startDay: 1, duration: 10 },
    t2: { id: 't2', code: '1.2', name: 'Tarea 2', levelType: 'Actividad', parentId: 'f1', isActive: true, startDay: 11, duration: 30 },
  };

  const assignments: Record<string, ResourceAssignment> = {
    a1: { id: 'a1', elementoWbsId: 't1', tarifaId: 'tar-sig', quantity: 1, quantityUnit: 'Persona', time: 2.5, timeUnit: 'Mes' },
    a2: { id: 'a2', elementoWbsId: 't2', tarifaId: 'tar-dig', quantity: 1, quantityUnit: 'Persona', time: 1, timeUnit: 'Mes' },
    // Indirecto asignado al nodo padre → se prorratea por costo directo de las hojas.
    a3: { id: 'a3', elementoWbsId: 'f1', tarifaId: 'tar-dir', quantity: 1, quantityUnit: 'Persona', time: 1, timeUnit: 'Mes' },
    // Gasto general asignado al padre, forzado a prorratear por duración.
    a4: { id: 'a4', elementoWbsId: 'f1', tarifaId: 'tar-gg', quantity: 1, quantityUnit: 'Global', time: 1, timeUnit: '-', isProrated: true },
  };

  const oferta: OfertaComercial = {
    version: '1.0',
    clientName: 'Cliente Test',
    projectName: 'Proyecto Test',
    projectNameFull: 'Proyecto Test Completo',
    sbu: 482,
    date: '',
    quoteType: 'economic',
    maxDetailLevel: 4,
    introText: '',
    discountType: 'none',
    discountValue: 0,
    quoteSequence: 'COT-TEST-2026',
    targetBudget: 0,
    globalInsurance: 0,
    globalContingency: 0,
    globalProfit: 35,
    milestones: [
      { id: 'm1', name: 'Anticipo', percentage: 30 },
      { id: 'm2', name: 'Final', percentage: 70 },
    ],
  };

  return { catalog, wbsNodes, assignments, oferta };
}

describe('calculate (motor completo)', () => {
  it('distribuye directos, prorratea indirectos por costo y gastos generales por duración', () => {
    const { catalog, wbsNodes, assignments, oferta } = buildFixture();
    const result = calculate(wbsNodes, assignments, catalog, oferta);

    // Directos: SIG en t1 = 1500*2.5 = 3750; Digitador en t2 = 800*1 = 800.
    expect(result.costByNode.t1.direct).toBeCloseTo(3750, 5);
    expect(result.costByNode.t2.direct).toBeCloseTo(800, 5);

    // Indirecto (2000, por costo) + gasto general (400, isProrated=true por duración)
    // se acumulan juntos en `.shared`; se verifican por separado abajo vía `.total`.
    const t1Shared = (2000 * 3750) / 4550 + 400 * (10 / 40);
    const t2Shared = (2000 * 800) / 4550 + 400 * (30 / 40);
    expect(result.costByNode.t1.total).toBeCloseTo(3750 + t1Shared, 5);
    expect(result.costByNode.t2.total).toBeCloseTo(800 + t2Shared, 5);

    // El padre f1 es la suma de sus hojas, y el costo base total es la suma de todo lo asignado.
    const costBase = 3750 + 800 + 2000 + 400;
    expect(result.costByNode.f1.total).toBeCloseTo(costBase, 5);
    expect(result.summary.costBase).toBeCloseTo(costBase, 5);

    // A.I.U.: 0% seguros, 0% imprevistos, 35% utilidad, sin descuento.
    expect(result.summary.profit).toBeCloseTo(costBase * 0.35, 5);
    expect(result.summary.total).toBeCloseTo(costBase * 1.35, 5);

    // Rollup de cronograma: f1 debe cubrir desde el día 1 hasta el fin de t2 (día 41).
    expect(result.scheduleByNode.f1).toEqual({ startDay: 1, duration: 40 });

    expect(result.warnings).toHaveLength(0);

    // Auditoría de contribuciones: cada asignación debe quedar trazada.
    const direct = result.contributions.filter((c) => c.kind === 'direct');
    expect(direct).toEqual([
      { assignmentId: 'a1', tarifaId: 'tar-sig', sourceNodeId: 't1', leafId: 't1', amount: 3750, kind: 'direct' },
      { assignmentId: 'a2', tarifaId: 'tar-dig', sourceNodeId: 't2', leafId: 't2', amount: 800, kind: 'direct' },
    ]);

    const bySourceA3 = result.contributions.filter((c) => c.assignmentId === 'a3');
    expect(bySourceA3).toHaveLength(2);
    bySourceA3.forEach((c) => expect(c.basis).toBe('directCost'));
    expect(bySourceA3.find((c) => c.leafId === 't1')?.amount).toBeCloseTo((2000 * 3750) / 4550, 5);
    expect(bySourceA3.find((c) => c.leafId === 't2')?.amount).toBeCloseTo((2000 * 800) / 4550, 5);

    const bySourceA4 = result.contributions.filter((c) => c.assignmentId === 'a4');
    bySourceA4.forEach((c) => expect(c.basis).toBe('duration'));
    expect(bySourceA4.find((c) => c.leafId === 't1')?.amount).toBeCloseTo(400 * (10 / 40), 5);
    expect(bySourceA4.find((c) => c.leafId === 't2')?.amount).toBeCloseTo(400 * (30 / 40), 5);

    // La suma de contribuciones por hoja debe reconstruir exactamente costByNode.total.
    const sumForLeaf = (leafId: string) =>
      result.contributions.filter((c) => c.leafId === leafId).reduce((acc, c) => acc + c.amount, 0);
    expect(sumForLeaf('t1')).toBeCloseTo(result.costByNode.t1.total, 5);
    expect(sumForLeaf('t2')).toBeCloseTo(result.costByNode.t2.total, 5);
  });

  it('marca basis "equal" cuando ninguna hoja tiene costo directo para prorratear', () => {
    const { catalog, wbsNodes, assignments, oferta } = buildFixture();
    // Sin asignaciones directas, a3 (indirecto, prorrateo por costo) debe caer en reparto igualitario.
    delete assignments.a1;
    delete assignments.a2;
    delete assignments.a4;

    const result = calculate(wbsNodes, assignments, catalog, oferta);
    const shared = result.contributions.filter((c) => c.assignmentId === 'a3');
    expect(shared).toHaveLength(2);
    shared.forEach((c) => {
      expect(c.basis).toBe('equal');
      expect(c.amount).toBeCloseTo(1000, 5); // 2000 / 2 hojas
    });
  });

  it('reporta un warning si una asignación referencia un id inexistente', () => {
    const { catalog, wbsNodes, assignments, oferta } = buildFixture();
    assignments.bad = {
      id: 'bad',
      elementoWbsId: 'no-existe',
      tarifaId: 'tar-sig',
      quantity: 1,
      quantityUnit: 'Persona',
      time: 1,
      timeUnit: 'Mes',
    };
    const result = calculate(wbsNodes, assignments, catalog, oferta);
    expect(result.warnings.some((w) => w.includes('bad'))).toBe(true);
  });
});

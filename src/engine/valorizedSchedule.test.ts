import { describe, expect, it } from 'vitest';
import { buildWbsTree, type NodeCost } from './pricingEngine';
import { buildValorizedSchedule, daysPerZoom } from './valorizedSchedule';
import type { WbsNode } from './types';

describe('daysPerZoom', () => {
  it('reutiliza la tabla de conversión de unidades de tiempo', () => {
    expect(daysPerZoom('Día')).toBe(1);
    expect(daysPerZoom('Semana')).toBe(7);
    expect(daysPerZoom('Mes')).toBe(30);
  });
});

function buildFixture() {
  const wbsNodes: Record<string, WbsNode> = {
    f1: { id: 'f1', code: '1', name: 'Fase 1', levelType: 'Fase', parentId: null, isActive: true, startDay: 1, duration: 1 },
    t1: { id: 't1', code: '1.1', name: 'Tarea 1', levelType: 'Actividad', parentId: 'f1', isActive: true, startDay: 1, duration: 10 },
    t2: { id: 't2', code: '1.2', name: 'Tarea 2', levelType: 'Actividad', parentId: 'f1', isActive: true, startDay: 11, duration: 20 },
  };
  const costByNode: Record<string, NodeCost> = {
    f1: { direct: 0, shared: 0, total: 3000 },
    t1: { direct: 1000, shared: 0, total: 1000 },
    t2: { direct: 2000, shared: 0, total: 2000 },
  };
  const scheduleByNode: Record<string, { startDay: number; duration: number }> = {
    f1: { startDay: 1, duration: 30 },
    t1: { startDay: 1, duration: 10 },
    t2: { startDay: 11, duration: 20 },
  };
  const roots = buildWbsTree(wbsNodes);
  return { roots, costByNode, scheduleByNode };
}

describe('buildValorizedSchedule', () => {
  it('distribuye el costo de cada hoja uniformemente por día y lo agrupa en períodos', () => {
    const { roots, costByNode, scheduleByNode } = buildFixture();
    // Zoom "Semana" (7 días): t1 dura 10 días (días 1-10), t2 dura 20 días (días 11-30).
    const result = buildValorizedSchedule(roots, costByNode, scheduleByNode, 'Semana');

    // t1: $1000 / 10 días = $100/día. Semana 1 = días 1-7 (7 días) → $700. Semana 2 = días 8-14, overlap con t1 = días 8-10 (3 días) → $300.
    expect(result.amountsByNode.t1[0]).toBeCloseTo(700, 5);
    expect(result.amountsByNode.t1[1]).toBeCloseTo(300, 5);
    expect(result.amountsByNode.t1.slice(2).every((v) => v === 0)).toBe(true);

    // t2: $2000 / 20 días = $100/día, días 11-30. Semana 2 (días 8-14): overlap 11-14 = 4 días → $400.
    expect(result.amountsByNode.t2[1]).toBeCloseTo(400, 5);
    // Semana 3 (días 15-21): 7 días completos dentro del rango 11-30 → $700.
    expect(result.amountsByNode.t2[2]).toBeCloseTo(700, 5);

    // f1 (padre) es la suma de sus hijos, período a período.
    result.periods.forEach((_, i) => {
      expect(result.amountsByNode.f1[i]).toBeCloseTo(
        result.amountsByNode.t1[i] + result.amountsByNode.t2[i],
        5
      );
    });

    // La suma de todos los períodos de cada hoja debe reconstruir su costo total.
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    expect(sum(result.amountsByNode.t1)).toBeCloseTo(1000, 5);
    expect(sum(result.amountsByNode.t2)).toBeCloseTo(2000, 5);
    expect(sum(result.totalsByPeriod)).toBeCloseTo(3000, 5);
  });

  it('etiqueta los períodos según el zoom', () => {
    const { roots, costByNode, scheduleByNode } = buildFixture();
    const meses = buildValorizedSchedule(roots, costByNode, scheduleByNode, 'Mes');
    expect(meses.periods[0].label).toBe('Mes 1');
    expect(meses.periods).toHaveLength(1); // horizonte de 30 días cabe en 1 mes

    const dias = buildValorizedSchedule(roots, costByNode, scheduleByNode, 'Día');
    expect(dias.periods).toHaveLength(30);
    expect(dias.periods[0].label).toBe('Día 1');
  });

  it('no cuenta costo de nodos inactivos', () => {
    const { roots, costByNode, scheduleByNode } = buildFixture();
    roots[0].children[0].isActive = false; // desactiva t1 en el árbol ya construido
    const result = buildValorizedSchedule(roots, costByNode, scheduleByNode, 'Semana');
    expect(result.amountsByNode.t1.every((v) => v === 0)).toBe(true);
  });

  it('respeta un horizonte mínimo aunque no haya nodos', () => {
    const result = buildValorizedSchedule([], {}, {}, 'Mes', 210);
    expect(result.periods).toHaveLength(7); // 210 días / 30 = 7 meses
    expect(result.totalsByPeriod.every((v) => v === 0)).toBe(true);
  });
});

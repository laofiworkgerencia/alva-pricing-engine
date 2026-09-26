import { getCatTimeInDays } from './timeUnits';
import type { NodeCost, WbsTreeNode } from './pricingEngine';

export type GanttZoom = 'Día' | 'Semana' | 'Mes';

export interface ValorizedPeriod {
  index: number;
  /** Día de inicio del período, 1-based, inclusive. */
  startDay: number;
  /** Día de fin del período, 1-based, inclusive. */
  endDay: number;
  label: string;
}

export interface ValorizedSchedule {
  periods: ValorizedPeriod[];
  /** Monto por nodo (incluye padres, como rollup de sus hojas activas) y período. */
  amountsByNode: Record<string, number[]>;
  /** Suma de todos los nodos raíz, por período — la fila de "Total". */
  totalsByPeriod: number[];
}

/** Días por unidad de zoom, reutilizando la misma tabla que las unidades de tiempo del catálogo. */
export function daysPerZoom(zoom: GanttZoom): number {
  return getCatTimeInDays(zoom);
}

function leafDayRange(schedule: { startDay: number; duration: number }): [number, number] {
  const startDay = schedule.startDay;
  const endDay = startDay + Math.max(schedule.duration, 1) - 1;
  return [startDay, endDay];
}

function overlapDays(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start + 1);
}

/**
 * Distribuye el costo total de cada hoja uniformemente entre los días de su
 * `scheduleByNode`, lo agrupa en períodos de `periodLengthDays` días, y hace
 * rollup hacia los nodos padre (suma de sus hojas activas) — igual que
 * `costByNode`/`scheduleByNode`, pero desagregado en el tiempo.
 */
export function buildValorizedSchedule(
  roots: WbsTreeNode[],
  costByNode: Record<string, NodeCost>,
  scheduleByNode: Record<string, { startDay: number; duration: number }>,
  zoom: GanttZoom,
  horizonDaysOverride?: number
): ValorizedSchedule {
  const periodLengthDays = daysPerZoom(zoom);

  const scheduleEntries = Object.values(scheduleByNode);
  const naturalHorizon = scheduleEntries.reduce(
    (max, s) => Math.max(max, s.startDay + Math.max(s.duration, 1) - 1),
    0
  );
  const horizon = Math.max(horizonDaysOverride ?? 0, naturalHorizon, periodLengthDays);

  const numPeriods = Math.max(1, Math.ceil(horizon / periodLengthDays));
  const periods: ValorizedPeriod[] = Array.from({ length: numPeriods }, (_, i) => {
    const startDay = i * periodLengthDays + 1;
    const endDay = startDay + periodLengthDays - 1;
    const label = zoom === 'Mes' ? `Mes ${i + 1}` : zoom === 'Semana' ? `Semana ${i + 1}` : `Día ${startDay}`;
    return { index: i, startDay, endDay, label };
  });

  const amountsByNode: Record<string, number[]> = {};
  const zeroRow = () => new Array(numPeriods).fill(0);

  const visit = (node: WbsTreeNode): number[] => {
    if (node.children.length === 0) {
      const row = zeroRow();
      const schedule = scheduleByNode[node.id];
      const total = costByNode[node.id]?.total ?? 0;
      if (schedule && node.isActive && total !== 0) {
        const [leafStart, leafEnd] = leafDayRange(schedule);
        const totalDays = Math.max(leafEnd - leafStart + 1, 1);
        const dailyRate = total / totalDays;
        periods.forEach((p, i) => {
          const days = overlapDays(leafStart, leafEnd, p.startDay, p.endDay);
          if (days > 0) row[i] = dailyRate * days;
        });
      }
      amountsByNode[node.id] = row;
      return row;
    }

    const row = zeroRow();
    node.children.forEach((child) => {
      const childRow = visit(child);
      childRow.forEach((v, i) => {
        row[i] += v;
      });
    });
    amountsByNode[node.id] = row;
    return row;
  };

  const totalsByPeriod = zeroRow();
  roots.forEach((root) => {
    visit(root).forEach((v, i) => {
      totalsByPeriod[i] += v;
    });
  });

  return { periods, amountsByNode, totalsByPeriod };
}

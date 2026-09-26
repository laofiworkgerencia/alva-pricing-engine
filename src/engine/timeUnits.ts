import type { TimeUnit } from './types';

const TIME_UNIT_DAYS: Record<Exclude<TimeUnit, '-'>, number> = {
  Hora: 0.125, // jornada de 8 horas
  Día: 1,
  Semana: 7,
  Mes: 30,
};

const TIME_BASED_UNITS = new Set(Object.keys(TIME_UNIT_DAYS));

export function isTimeBasedUnit(unit: string): boolean {
  return TIME_BASED_UNITS.has(unit);
}

/** Convierte una unidad de tiempo a días. Unidades no temporales (Global, Kit, etc.) devuelven 0. */
export function getCatTimeInDays(unit: string): number {
  return TIME_UNIT_DAYS[unit as Exclude<TimeUnit, '-'>] ?? 0;
}

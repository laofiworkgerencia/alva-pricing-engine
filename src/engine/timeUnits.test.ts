import { describe, expect, it } from 'vitest';
import { getCatTimeInDays, isTimeBasedUnit } from './timeUnits';

describe('getCatTimeInDays', () => {
  it('convierte las unidades de tiempo documentadas a días', () => {
    expect(getCatTimeInDays('Hora')).toBe(0.125);
    expect(getCatTimeInDays('Día')).toBe(1);
    expect(getCatTimeInDays('Semana')).toBe(7);
    expect(getCatTimeInDays('Mes')).toBe(30);
  });

  it('devuelve 0 para unidades no temporales', () => {
    expect(getCatTimeInDays('Global')).toBe(0);
    expect(getCatTimeInDays('Kit')).toBe(0);
  });
});

describe('isTimeBasedUnit', () => {
  it('reconoce las 4 unidades temporales', () => {
    expect(isTimeBasedUnit('Hora')).toBe(true);
    expect(isTimeBasedUnit('Día')).toBe(true);
    expect(isTimeBasedUnit('Semana')).toBe(true);
    expect(isTimeBasedUnit('Mes')).toBe(true);
  });

  it('rechaza unidades no temporales', () => {
    expect(isTimeBasedUnit('Global')).toBe(false);
    expect(isTimeBasedUnit('Unidad')).toBe(false);
  });
});

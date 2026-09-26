import { describe, expect, it } from 'vitest';
import { extractDuration, parseMarkdownWBS } from './wbsMarkdownParser';

const SAMPLE_MD = `
### 1 - FASE 1: GEODESIA Y CONTROL TERRESTRE (Fase)
**1. DE QUÉ SE TRATA:** Establecimiento de la Red Geodésica de alta precisión.
**2. OBJETIVO SMART:** Completar la red geodésica en 30 días con 8 vértices certificados.
**3. LISTADO DE ENTREGABLES:** Red Geodésica Ajustada, Monografías IGM, Certificados
**7. DESARROLLO TÉCNICO:** Postproceso de vectores GNSS y ajuste de mínimos cuadrados.

### 1.1 - Planificación y Logística (Actividad)
**1. DE QUÉ SE TRATA:** Preparación de recursos y reconocimiento del territorio.
**2. OBJETIVO SMART:** Duración: 10 días.

### 1.1.1 - Reconocimiento y Monumentación (Acción)
**1. DE QUÉ SE TRATA:** Construcción física de los hitos en terreno.
**3. LISTADO DE ENTREGABLES:** Certificados IGM

### 1.1.1.01 - Inspección de rutas y monumentación (Tarea)
**1. DE QUÉ SE TRATA:** Visita a campo para ubicar puntos intervisibles y libres de estática.
**2. OBJETIVO SMART:** Duración: 5 días.
**7. DESARROLLO TÉCNICO:** Levantamiento con receptores GNSS de doble frecuencia.
`;

describe('extractDuration', () => {
  it('extrae días de "X días"', () => {
    expect(extractDuration('Duración: 5 días.')).toBe(5);
  });
  it('extrae meses de "X meses" y los convierte a días (×30)', () => {
    expect(extractDuration('Completar en 2 meses.')).toBe(60);
  });
  it('devuelve 10 por defecto si no hay patrón reconocible', () => {
    expect(extractDuration('Sin ninguna duración mencionada.')).toBe(10);
    expect(extractDuration(undefined)).toBe(10);
  });
});

describe('parseMarkdownWBS', () => {
  const nodes = parseMarkdownWBS(SAMPLE_MD);

  it('parsea los 4 nodos con su levelType normalizado', () => {
    expect(nodes).toHaveLength(4);
    const byCode = Object.fromEntries(nodes.map((n) => [n.code, n]));
    expect(byCode['1'].levelType).toBe('Fase');
    expect(byCode['1.1'].levelType).toBe('Actividad');
    expect(byCode['1.1.1'].levelType).toBe('Acción');
    expect(byCode['1.1.1.01'].levelType).toBe('Tarea');
  });

  it('reconstruye parentId a partir del prefijo del código', () => {
    const byCode = Object.fromEntries(nodes.map((n) => [n.code, n]));
    expect(byCode['1'].parentId).toBeNull();
    expect(byCode['1.1'].parentId).toBe(byCode['1'].id);
    expect(byCode['1.1.1'].parentId).toBe(byCode['1.1'].id);
    expect(byCode['1.1.1.01'].parentId).toBe(byCode['1.1.1'].id);
  });

  it('extrae la duración desde desc_smart', () => {
    const byCode = Object.fromEntries(nodes.map((n) => [n.code, n]));
    expect(byCode['1'].duration).toBe(30);
    expect(byCode['1.1'].duration).toBe(10);
    expect(byCode['1.1.1.01'].duration).toBe(5);
  });

  it('separa los entregables por coma', () => {
    const byCode = Object.fromEntries(nodes.map((n) => [n.code, n]));
    expect(byCode['1'].deliverable).toBe(
      'Red Geodésica Ajustada | Monografías IGM | Certificados'
    );
  });

  it('captura desc_general y desc_tecnica', () => {
    const byCode = Object.fromEntries(nodes.map((n) => [n.code, n]));
    expect(byCode['1'].descGeneral).toContain('Red Geodésica de alta precisión');
    expect(byCode['1.1.1.01'].descTecnica).toContain('receptores GNSS de doble frecuencia');
  });
});

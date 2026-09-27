import { describe, expect, it } from 'vitest';
import { NARRATIVE_SECTIONS, buildNarrativePrompt } from './narrativePrompt';

describe('buildNarrativePrompt', () => {
  it('incluye los datos del proyecto cuando están presentes', () => {
    const prompt = buildNarrativePrompt(
      {
        clientName: 'GAD Municipal Ejemplo',
        projectNameFull: 'Diagnóstico integral del sistema catastral municipal.',
        areaTotalKm2: 120,
        edificacionesTotal: 3500,
      },
      'alerta_normativa'
    );
    expect(prompt).toContain('GAD Municipal Ejemplo');
    expect(prompt).toContain('Diagnóstico integral del sistema catastral municipal.');
    expect(prompt).toContain('120 km2');
    expect(prompt).toContain('3500 edificaciones');
    expect(prompt).toContain('Alerta Normativa');
  });

  it('usa los valores por defecto cuando falta contexto', () => {
    const prompt = buildNarrativePrompt({}, 'solucion');
    expect(prompt).toContain('No especificado');
    expect(prompt).toContain('No especificada');
    expect(prompt).toContain('Consultoría en Geomática');
    expect(prompt).toContain('La Solución (Visión y Metodología)');
  });

  it('define exactamente las 2 secciones del NarrativeEditor original', () => {
    expect(NARRATIVE_SECTIONS.map((s) => s.id)).toEqual(['alerta_normativa', 'solucion']);
  });
});

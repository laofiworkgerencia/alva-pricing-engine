import { describe, expect, it } from 'vitest';
import {
  ProjectImportError,
  parseProjectFile,
  serializeProjectFileToWireJson,
} from './projectIO';
import type { ProjectData } from './types';

function buildMinimalProject(): ProjectData {
  return {
    version: '14.8',
    categorias: {
      'n1-1': { id: 'n1-1', name: '1. COSTOS DIRECTOS' },
    },
    rubrosPrincipales: {
      'n2-1': { id: 'n2-1', parentId: 'n1-1', name: '1. Remuneraciones' },
    },
    rubrosSecundarios: {
      'sec-1': { id: 'sec-1', parentId: 'n2-1', name: 'Honorarios Factura' },
    },
    rubrosDetallados: {
      'det-1': { id: 'det-1', parentId: 'sec-1', name: 'Director de Proyecto PMP', description: 'Gestión integral.' },
    },
    tarifas: {
      'tar-1': { id: 'tar-1', parentId: 'det-1', supplier: 'Servicios Profesionales', unitCost: 2178.57, unit: 'Mes' },
    },
    elementosWbs: {
      'wbs-1': {
        id: 'wbs-1',
        code: '1',
        name: 'FASE 1',
        levelType: 'Fase',
        parentId: null,
        isActive: true,
        descGeneral: 'Diagnóstico inicial.',
        descSmart: '',
        descKpi: '',
        descAporte: '',
        descInsumos: '',
        descTecnica: '',
        startDay: 1,
        duration: 30,
        deliverable: 'Informe',
      },
    },
    recursosWbs: {
      'res-1': {
        id: 'res-1',
        elementoWbsId: 'wbs-1',
        tarifaId: 'tar-1',
        quantity: 1,
        quantityUnit: 'Persona',
        time: 1,
        timeUnit: 'Mes',
      },
    },
    ofertaComercial: {
      version: '14.8',
      clientName: 'GAD Municipal Ejemplo',
      projectName: 'Diagnóstico Catastral',
      projectNameFull: 'Diagnóstico integral del sistema catastral municipal.',
      sbu: 482,
      date: '',
      quoteType: 'economic',
      maxDetailLevel: 4,
      introText: '',
      discountType: 'none',
      discountValue: 0,
      quoteSequence: 'COT-EJEMPLO-2026',
      targetBudget: 0,
      globalInsurance: 0,
      globalContingency: 0,
      globalProfit: 35,
      milestones: [
        { id: 'm1', name: 'Anticipo', percentage: 30 },
        { id: 'm2', name: 'Final', percentage: 70 },
      ],
    },
    narrativa: {
      alerta_normativa: { texto: 'Marco legal que obliga al cliente a contratar esto.' },
    },
  };
}

describe('serializeProjectFileToWireJson / parseProjectFile', () => {
  it('hace un round-trip sin pérdida de datos', () => {
    const original = buildMinimalProject();
    const wireJson = serializeProjectFileToWireJson(original);
    const parsedBack = parseProjectFile(JSON.parse(wireJson));
    expect(parsedBack).toEqual(original);
  });

  it('el JSON serializado usa el formato de intercambio real (parentId, elemento_wbs_id, etc.)', () => {
    const wireJson = JSON.parse(serializeProjectFileToWireJson(buildMinimalProject()));
    expect(wireJson.empresa).toBe('LaOfi S.A.S.');
    expect(wireJson.data.elementos_wbs['wbs-1'].parentId).toBeNull();
    expect(wireJson.data.recursos_wbs['res-1'].elemento_wbs_id).toBe('wbs-1');
    expect(wireJson.data.recursos_wbs['res-1'].tarifa_id).toBe('tar-1');
    expect(wireJson.data.narrativa.alerta_normativa.texto).toContain('Marco legal');
  });

  it('importa un archivo sin campo narrativa (proyectos exportados por la app original)', () => {
    const wireJson = JSON.parse(serializeProjectFileToWireJson(buildMinimalProject()));
    delete wireJson.data.narrativa;
    const parsed = parseProjectFile(wireJson);
    expect(parsed.narrativa).toEqual({});
  });

  it('importa un archivo real de producción sin startDay ni quantityUnit (la app original no los persiste)', () => {
    const wireJson = JSON.parse(serializeProjectFileToWireJson(buildMinimalProject()));
    delete wireJson.data.elementos_wbs['wbs-1'].startDay;
    delete wireJson.data.recursos_wbs['res-1'].quantityUnit;
    const parsed = parseProjectFile(wireJson);
    expect(parsed.elementosWbs['wbs-1'].startDay).toBe(1);
    expect(parsed.recursosWbs['res-1'].quantityUnit).toBe('Persona');
  });

  it('rechaza un archivo sin empresa === "LaOfi S.A.S."', () => {
    const bad = { empresa: 'Otra Empresa', version: '1', timestamp: '', data: {} };
    expect(() => parseProjectFile(bad)).toThrow(ProjectImportError);
  });

  it('rechaza un archivo al que le falta elementos_wbs', () => {
    const wireJson = JSON.parse(serializeProjectFileToWireJson(buildMinimalProject()));
    delete wireJson.data.elementos_wbs;
    expect(() => parseProjectFile(wireJson)).toThrow(ProjectImportError);
  });
});

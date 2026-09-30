import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { buildClassicProposalDocx } from './classicDocxExport';
import { calculate } from './pricingEngine';
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
      duration: 10,
      deliverable: 'Plan | Cronograma',
      descGeneral: 'Planificación general.',
    },
  };
  const recursosWbs: Record<string, ResourceAssignment> = {
    r1: {
      id: 'r1',
      elementoWbsId: 'f1',
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
      maxDetailLevel: 4,
      introText: 'Texto introductorio.',
      discountType: 'none',
      discountValue: 0,
      quoteSequence: 'COT-TEST',
      targetBudget: 0,
      globalInsurance: 0,
      globalContingency: 0,
      globalProfit: 0,
      milestones: [{ id: 'm1', name: 'Anticipo', percentage: 100, linkedWbsId: 'f1' }],
      contextoTerritorial: { areaTotalKm2: 100, poblacionTotal: 5000, notas: 'Dato de ejemplo.' },
    },
    narrativa: { alerta_normativa: { texto: 'Marco legal aplicable.' } },
  };
}

describe('buildClassicProposalDocx', () => {
  it('genera un Document que se empaqueta a un .docx (zip OOXML) no vacío', async () => {
    const project = buildProject();
    const result = calculate(project.elementosWbs, project.recursosWbs, project, project.ofertaComercial);
    const doc = buildClassicProposalDocx(project, result);
    const buffer = await Packer.toBuffer(doc);

    expect(buffer.length).toBeGreaterThan(1000);
    // Todo .docx es un zip: firma PK\x03\x04 al inicio.
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('no truena cuando no hay contexto territorial, narrativa ni hitos vinculados', async () => {
    const project = buildProject();
    project.ofertaComercial.contextoTerritorial = undefined;
    project.narrativa = {};
    project.ofertaComercial.milestones = [{ id: 'm1', name: 'Anticipo', percentage: 100 }];
    const result = calculate(project.elementosWbs, project.recursosWbs, project, project.ofertaComercial);
    const doc = buildClassicProposalDocx(project, result);
    const buffer = await Packer.toBuffer(doc);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});

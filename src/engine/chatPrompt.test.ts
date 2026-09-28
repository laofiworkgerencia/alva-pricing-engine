import { describe, expect, it } from 'vitest';
import { buildChatSystemPrompt } from './chatPrompt';
import type { ProjectData } from './types';

function buildProject(): ProjectData {
  return {
    version: '1.0',
    categorias: {},
    rubrosPrincipales: {},
    rubrosSecundarios: {},
    rubrosDetallados: { 'det-1': { id: 'det-1', parentId: 'sec-1', name: 'Especialista SIG' } },
    tarifas: { 'tar-1': { id: 'tar-1', parentId: 'det-1', supplier: 'Nómina', unitCost: 1500, unit: 'Mes' } },
    elementosWbs: {
      f1: { id: 'f1', code: '1', name: 'Fase 1', levelType: 'Fase', parentId: null, isActive: true, startDay: 1, duration: 30 },
    },
    recursosWbs: {},
    ofertaComercial: {
      version: '1.0', clientName: '', projectName: '', projectNameFull: '', sbu: 482, date: '',
      quoteType: 'economic', maxDetailLevel: 4, introText: '', discountType: 'none', discountValue: 0,
      quoteSequence: '', targetBudget: 0, globalInsurance: 0, globalContingency: 0, globalProfit: 35,
      milestones: [],
    },
    narrativa: {},
  };
}

describe('buildChatSystemPrompt', () => {
  it('incluye el WBS y el catálogo actuales como JSON compacto', () => {
    const prompt = buildChatSystemPrompt(buildProject());
    expect(prompt).toContain('"codigo":"1"');
    expect(prompt).toContain('"tarea":"Fase 1"');
    expect(prompt).toContain('"nombre":"Especialista SIG"');
    expect(prompt).toContain('"costo":1500');
  });

  it('documenta los 5 tipos de comando', () => {
    const prompt = buildChatSystemPrompt(buildProject());
    for (const tipo of ['ADD_RESOURCE', 'UPDATE_RESOURCE', 'UPDATE_WBS', 'ADD_WBS', 'DELETE_WBS']) {
      expect(prompt).toContain(tipo);
    }
  });
});

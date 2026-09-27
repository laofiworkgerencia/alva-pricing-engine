import { describe, expect, it } from 'vitest';
import {
  addMilestone,
  removeMilestone,
  updateMilestone,
  updateNarrativeSection,
  updateOfertaComercial,
} from './ofertaOps';
import type { ProjectData } from './types';

function emptyProject(): ProjectData {
  return {
    version: '1.0',
    categorias: {},
    rubrosPrincipales: {},
    rubrosSecundarios: {},
    rubrosDetallados: {},
    tarifas: {},
    elementosWbs: {},
    recursosWbs: {},
    ofertaComercial: {
      version: '1.0', clientName: 'Cliente A', projectName: '', projectNameFull: '', sbu: 482, date: '',
      quoteType: 'economic', maxDetailLevel: 4, introText: '', discountType: 'none', discountValue: 0,
      quoteSequence: '', targetBudget: 0, globalInsurance: 0, globalContingency: 0, globalProfit: 35,
      milestones: [],
    },
    narrativa: {},
  };
}

describe('updateOfertaComercial', () => {
  it('mergea un patch sin afectar campos no incluidos', () => {
    const project = emptyProject();
    const next = updateOfertaComercial(project, { globalProfit: 40, clientName: 'Cliente B' });
    expect(next.ofertaComercial.globalProfit).toBe(40);
    expect(next.ofertaComercial.clientName).toBe('Cliente B');
    expect(next.ofertaComercial.sbu).toBe(482);
    // No muta el objeto original.
    expect(project.ofertaComercial.globalProfit).toBe(35);
  });
});

describe('hitos de facturación', () => {
  it('addMilestone agrega un hito con id generado', () => {
    const project = emptyProject();
    const next = addMilestone(project, { name: 'Anticipo', percentage: 30 });
    expect(next.ofertaComercial.milestones).toHaveLength(1);
    expect(next.ofertaComercial.milestones[0].name).toBe('Anticipo');
    expect(next.ofertaComercial.milestones[0].id).toBeTruthy();
  });

  it('updateMilestone edita solo el hito indicado', () => {
    let project = emptyProject();
    project = addMilestone(project, { name: 'Anticipo', percentage: 30 });
    project = addMilestone(project, { name: 'Final', percentage: 70 });
    const targetId = project.ofertaComercial.milestones[0].id;

    const next = updateMilestone(project, targetId, { percentage: 50 });
    expect(next.ofertaComercial.milestones[0].percentage).toBe(50);
    expect(next.ofertaComercial.milestones[1].percentage).toBe(70);
  });

  it('removeMilestone quita solo el hito indicado', () => {
    let project = emptyProject();
    project = addMilestone(project, { name: 'Anticipo', percentage: 30 });
    project = addMilestone(project, { name: 'Final', percentage: 70 });
    const targetId = project.ofertaComercial.milestones[0].id;

    const next = removeMilestone(project, targetId);
    expect(next.ofertaComercial.milestones).toHaveLength(1);
    expect(next.ofertaComercial.milestones[0].name).toBe('Final');
  });
});

describe('updateNarrativeSection', () => {
  it('agrega o reemplaza el texto de una sección sin afectar las demás', () => {
    let project = emptyProject();
    project = updateNarrativeSection(project, 'alerta_normativa', 'Primer borrador.');
    project = updateNarrativeSection(project, 'solucion', 'Metodología propuesta.');

    expect(project.narrativa.alerta_normativa?.texto).toBe('Primer borrador.');
    expect(project.narrativa.solucion?.texto).toBe('Metodología propuesta.');

    project = updateNarrativeSection(project, 'alerta_normativa', 'Versión editada.');
    expect(project.narrativa.alerta_normativa?.texto).toBe('Versión editada.');
    expect(project.narrativa.solucion?.texto).toBe('Metodología propuesta.');
  });
});

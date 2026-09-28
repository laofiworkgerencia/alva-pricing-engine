import { describe, expect, it } from 'vitest';
import { applyAiCommands, extractAiCommands, type AiCommand } from './aiCommands';
import { addWbsNode } from './wbsOps';
import type { ProjectData } from './types';

function buildProject(): ProjectData {
  let p: ProjectData = {
    version: '1.0',
    categorias: { 'n1-1': { id: 'n1-1', name: '1. COSTOS DIRECTOS' } },
    rubrosPrincipales: {
      'n2-1': { id: 'n2-1', parentId: 'n1-1', name: '1. Remuneraciones' },
      'n2-9': { id: 'n2-9', parentId: 'n1-1', name: '9. Otros' },
    },
    rubrosSecundarios: {},
    rubrosDetallados: {},
    tarifas: {
      'tar-1': { id: 'tar-1', parentId: 'det-1', supplier: 'Nómina', unitCost: 1000, unit: 'Mes' },
    },
    elementosWbs: {},
    recursosWbs: {},
    ofertaComercial: {
      version: '1.0', clientName: '', projectName: '', projectNameFull: '', sbu: 482, date: '',
      quoteType: 'economic', maxDetailLevel: 4, introText: '', discountType: 'none', discountValue: 0,
      quoteSequence: '', targetBudget: 0, globalInsurance: 0, globalContingency: 0, globalProfit: 35,
      milestones: [],
    },
    narrativa: {},
  };
  p.rubrosDetallados['det-1'] = { id: 'det-1', parentId: 'n2-1', name: 'Especialista SIG' };
  p = addWbsNode(p, { code: '1', name: 'Fase 1', levelType: 'Fase', parentId: null, isActive: true, startDay: 1, duration: 30 }, 'f1');
  return p;
}

describe('applyAiCommands — ADD_RESOURCE', () => {
  it('crea la cadena N3→N4→N5 y la asignación cuando no se referencia una tarifa existente', () => {
    const project = buildProject();
    const commands: AiCommand[] = [
      {
        tipo: 'ADD_RESOURCE', wbs_id: 'f1', nombre_recurso: 'Topógrafo', cantidad: 1,
        tiempo: 2, unidad_tiempo: 'Mes', costo_unitario: 800, unidad: 'Mes', rubro_secundario: 'Honorarios',
      },
    ];
    const { project: next, warnings } = applyAiCommands(project, commands);
    expect(warnings).toHaveLength(0);

    const assignment = Object.values(next.recursosWbs).find((a) => a.elementoWbsId === 'f1');
    expect(assignment).toBeDefined();
    const tarifa = next.tarifas[assignment!.tarifaId];
    expect(tarifa.unitCost).toBe(800);
    const n4 = next.rubrosDetallados[tarifa.parentId];
    expect(n4.name).toBe('Topógrafo');
  });

  it('reutiliza una tarifa existente cuando se pasa tarifa_id', () => {
    const project = buildProject();
    const { project: next, warnings } = applyAiCommands(project, [
      { tipo: 'ADD_RESOURCE', wbs_id: 'f1', tarifa_id: 'tar-1', cantidad: 2, tiempo: 1, unidad_tiempo: 'Mes' },
    ]);
    expect(warnings).toHaveLength(0);
    const assignment = Object.values(next.recursosWbs)[0];
    expect(assignment.tarifaId).toBe('tar-1');
    expect(assignment.quantity).toBe(2);
    // No debió crear rubros nuevos.
    expect(Object.keys(next.rubrosDetallados)).toEqual(['det-1']);
  });

  it('se omite con advertencia si el nodo WBS no existe', () => {
    const project = buildProject();
    const { project: next, warnings } = applyAiCommands(project, [
      { tipo: 'ADD_RESOURCE', wbs_id: 'no-existe', nombre_recurso: 'X' },
    ]);
    expect(warnings).toHaveLength(1);
    expect(Object.keys(next.recursosWbs)).toHaveLength(0);
  });

  it('unidad_tiempo inválida se normaliza a "-" en vez de romper el tipo', () => {
    const project = buildProject();
    const { project: next } = applyAiCommands(project, [
      { tipo: 'ADD_RESOURCE', wbs_id: 'f1', nombre_recurso: 'X', unidad_tiempo: 'Global' },
    ]);
    const assignment = Object.values(next.recursosWbs)[0];
    expect(assignment.timeUnit).toBe('-');
  });
});

describe('applyAiCommands — UPDATE_RESOURCE', () => {
  it('actualiza costo y el nombre del Rubro Detallado asociado', () => {
    const project = buildProject();
    const { project: next, warnings } = applyAiCommands(project, [
      { tipo: 'UPDATE_RESOURCE', tarifa_id: 'tar-1', costo_unitario: 1500, nombre_recurso: 'Especialista Senior' },
    ]);
    expect(warnings).toHaveLength(0);
    expect(next.tarifas['tar-1'].unitCost).toBe(1500);
    expect(next.rubrosDetallados['det-1'].name).toBe('Especialista Senior');
  });

  it('advierte si la tarifa no existe', () => {
    const project = buildProject();
    const { warnings } = applyAiCommands(project, [
      { tipo: 'UPDATE_RESOURCE', tarifa_id: 'no-existe', costo_unitario: 1 },
    ]);
    expect(warnings).toHaveLength(1);
  });
});

describe('applyAiCommands — WBS', () => {
  it('ADD_WBS resuelve el padre por prefijo de código y permite encadenar varios comandos', () => {
    const project = buildProject();
    const { project: next, warnings } = applyAiCommands(project, [
      { tipo: 'ADD_WBS', codigo: '1.1', nombre: 'Actividad 1', duracion: 10 },
      { tipo: 'ADD_WBS', codigo: '1.1.1', nombre: 'Tarea 1', duracion: 5, nivel: 'Tarea' },
    ]);
    expect(warnings).toHaveLength(0);
    const act = Object.values(next.elementosWbs).find((n) => n.code === '1.1')!;
    const tarea = Object.values(next.elementosWbs).find((n) => n.code === '1.1.1')!;
    expect(act.parentId).toBe('f1');
    expect(act.levelType).toBe('Actividad');
    expect(tarea.parentId).toBe(act.id);
    expect(tarea.levelType).toBe('Tarea');
  });

  it('UPDATE_WBS cambia nombre/duración y DELETE_WBS elimina en cascada', () => {
    const project = buildProject();
    let result = applyAiCommands(project, [
      { tipo: 'UPDATE_WBS', wbs_id: 'f1', nuevo_nombre: 'Fase renombrada', nueva_duracion: 45 },
    ]);
    expect(result.project.elementosWbs.f1.name).toBe('Fase renombrada');
    expect(result.project.elementosWbs.f1.duration).toBe(45);

    result = applyAiCommands(result.project, [{ tipo: 'DELETE_WBS', wbs_id: 'f1' }]);
    expect(result.project.elementosWbs.f1).toBeUndefined();
  });

  it('advierte y omite ADD_RESOURCE/UPDATE_WBS/DELETE_WBS sobre ids inexistentes sin lanzar', () => {
    const project = buildProject();
    const { warnings } = applyAiCommands(project, [
      { tipo: 'UPDATE_WBS', wbs_id: 'no-existe', nuevo_nombre: 'x' },
      { tipo: 'DELETE_WBS', wbs_id: 'no-existe' },
    ]);
    expect(warnings).toHaveLength(2);
  });
});

describe('extractAiCommands', () => {
  it('separa el texto visible del bloque JSON de comandos', () => {
    const aiText = 'Listo, agregué el recurso.\n```json\n{"comandos":[{"tipo":"UPDATE_WBS","wbs_id":"f1","nuevo_nombre":"X"}]}\n```';
    const { displayText, commands } = extractAiCommands(aiText);
    expect(displayText).toBe('Listo, agregué el recurso.');
    expect(commands).toHaveLength(1);
    expect(commands[0].tipo).toBe('UPDATE_WBS');
  });

  it('sin bloque JSON, devuelve el texto tal cual y comandos vacíos', () => {
    const { displayText, commands } = extractAiCommands('Solo una respuesta conversacional.');
    expect(displayText).toBe('Solo una respuesta conversacional.');
    expect(commands).toHaveLength(0);
  });

  it('un bloque JSON malformado no lanza excepción, solo se ignora', () => {
    const { commands } = extractAiCommands('Texto\n```json\n{ esto no es json valido\n```');
    expect(commands).toHaveLength(0);
  });
});

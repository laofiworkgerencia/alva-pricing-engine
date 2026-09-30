import { z } from 'zod';
import type { ProjectData, ProjectFile, ResourceAssignment, WbsNode } from './types';
import { wireProjectFileSchema, type WireProjectData } from './wireSchema';

export class ProjectImportError extends Error {}

function fromWire(data: WireProjectData): ProjectData {
  const elementosWbs: Record<string, WbsNode> = {};
  Object.entries(data.elementos_wbs).forEach(([id, n]) => {
    elementosWbs[id] = {
      id: n.id,
      code: n.code,
      name: n.name,
      levelType: n.levelType,
      parentId: n.parentId,
      isActive: n.isActive,
      descGeneral: n.desc_general,
      descSmart: n.desc_smart,
      descKpi: n.desc_kpi,
      descAporte: n.desc_aporte,
      descInsumos: n.desc_insumos,
      descTecnica: n.desc_tecnica,
      deliverable: n.deliverable,
      startDay: n.startDay ?? 1,
      duration: n.duration,
    };
  });

  const recursosWbs: Record<string, ResourceAssignment> = {};
  Object.entries(data.recursos_wbs).forEach(([id, r]) => {
    recursosWbs[id] = {
      id: r.id,
      elementoWbsId: r.elemento_wbs_id,
      tarifaId: r.tarifa_id,
      quantity: r.quantity,
      quantityUnit: r.quantityUnit ?? 'Persona',
      time: r.time,
      timeUnit: r.timeUnit as ResourceAssignment['timeUnit'],
      isProrated: r.isProrated,
      excludedIds: r.excluded_ids,
      observations: r.observations,
    };
  });

  return {
    version: data.version,
    categorias: data.categorias,
    rubrosPrincipales: data.rubros_principales,
    rubrosSecundarios: data.rubros_secundarios,
    rubrosDetallados: data.rubros_detallados,
    tarifas: Object.fromEntries(
      Object.entries(data.tarifas).map(([id, t]) => [
        id,
        { ...t, unit: t.unit as ProjectData['tarifas'][string]['unit'] },
      ])
    ),
    elementosWbs,
    recursosWbs,
    ofertaComercial: {
      ...data.oferta_comercial,
      milestones: data.oferta_comercial.milestones.map((m) => ({
        ...m,
        linkedWbsId: m.linkedWbsId || undefined,
      })),
    },
    narrativa: (data.narrativa ?? {}) as ProjectData['narrativa'],
  };
}

function toWire(data: ProjectData): WireProjectData {
  const elementos_wbs: WireProjectData['elementos_wbs'] = {};
  Object.entries(data.elementosWbs).forEach(([id, n]) => {
    elementos_wbs[id] = {
      id: n.id,
      code: n.code,
      name: n.name,
      levelType: n.levelType,
      parentId: n.parentId,
      isActive: n.isActive,
      desc_general: n.descGeneral ?? '',
      desc_smart: n.descSmart ?? '',
      desc_kpi: n.descKpi ?? '',
      desc_aporte: n.descAporte ?? '',
      desc_insumos: n.descInsumos ?? '',
      desc_tecnica: n.descTecnica ?? '',
      deliverable: n.deliverable ?? '',
      startDay: n.startDay,
      duration: n.duration,
    };
  });

  const recursos_wbs: WireProjectData['recursos_wbs'] = {};
  Object.entries(data.recursosWbs).forEach(([id, r]) => {
    recursos_wbs[id] = {
      id: r.id,
      elemento_wbs_id: r.elementoWbsId,
      tarifa_id: r.tarifaId,
      quantity: r.quantity,
      quantityUnit: r.quantityUnit,
      time: r.time,
      timeUnit: r.timeUnit,
      isProrated: r.isProrated,
      excluded_ids: r.excludedIds,
      observations: r.observations,
    };
  });

  return {
    version: data.version,
    categorias: data.categorias,
    rubros_principales: data.rubrosPrincipales,
    rubros_secundarios: data.rubrosSecundarios,
    rubros_detallados: data.rubrosDetallados,
    tarifas: data.tarifas,
    elementos_wbs,
    recursos_wbs,
    oferta_comercial: {
      ...data.ofertaComercial,
      milestones: data.ofertaComercial.milestones.map((m) => ({
        ...m,
        linkedWbsId: m.linkedWbsId ?? '',
      })),
    },
    narrativa: data.narrativa as WireProjectData['narrativa'],
  };
}

/**
 * Valida y convierte un archivo importado (JSON crudo) al modelo interno.
 * Lanza ProjectImportError con un mensaje legible si no cumple el formato
 * "LaOfi S.A.S." que exige el importador original.
 */
export function parseProjectFile(raw: unknown): ProjectData {
  const result = wireProjectFileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
      .join('; ');
    throw new ProjectImportError(`Archivo de proyecto inválido: ${issues}`);
  }
  return fromWire(result.data.data);
}

export function serializeProjectFile(data: ProjectData): ProjectFile {
  return {
    empresa: 'LaOfi S.A.S.',
    version: data.version,
    timestamp: new Date().toISOString(),
    data,
  };
}

export function serializeProjectFileToWireJson(data: ProjectData): string {
  return JSON.stringify(
    {
      empresa: 'LaOfi S.A.S.',
      version: data.version,
      timestamp: new Date().toISOString(),
      data: toWire(data),
    },
    null,
    2
  );
}

// Se re-exporta para que el resto de la app no necesite importar zod directamente.
export { z };

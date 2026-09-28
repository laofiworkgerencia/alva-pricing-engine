import { generateId } from './id';
import type { ProjectData, ResourceAssignment, TarifaUnit } from './types';

function omit<T extends Record<string, unknown>>(record: T, id: string): T {
  const { [id]: _removed, ...rest } = record;
  return rest as T;
}

// --- N3: Rubro Secundario ---------------------------------------------------

export function addRubroSecundario(
  project: ProjectData,
  parentId: string,
  name: string,
  id: string = generateId()
): ProjectData {
  return {
    ...project,
    rubrosSecundarios: { ...project.rubrosSecundarios, [id]: { id, parentId, name } },
  };
}

export function renameRubroSecundario(
  project: ProjectData,
  id: string,
  name: string
): ProjectData {
  const existing = project.rubrosSecundarios[id];
  if (!existing) return project;
  return {
    ...project,
    rubrosSecundarios: { ...project.rubrosSecundarios, [id]: { ...existing, name } },
  };
}

/** Elimina un Rubro Secundario y, en cascada, sus Rubros Detallados, Tarifas y asignaciones. */
export function removeRubroSecundario(project: ProjectData, id: string): ProjectData {
  const childIds = Object.values(project.rubrosDetallados)
    .filter((d) => d.parentId === id)
    .map((d) => d.id);
  const next = childIds.reduce((acc, childId) => removeRubroDetallado(acc, childId), project);
  return { ...next, rubrosSecundarios: omit(next.rubrosSecundarios, id) };
}

// --- N4: Rubro Detallado -----------------------------------------------------

export function addRubroDetallado(
  project: ProjectData,
  parentId: string,
  name: string,
  description = '',
  id: string = generateId()
): ProjectData {
  return {
    ...project,
    rubrosDetallados: {
      ...project.rubrosDetallados,
      [id]: { id, parentId, name, description },
    },
  };
}

export function updateRubroDetallado(
  project: ProjectData,
  id: string,
  patch: Partial<Pick<ProjectData['rubrosDetallados'][string], 'name' | 'description'>>
): ProjectData {
  const existing = project.rubrosDetallados[id];
  if (!existing) return project;
  return {
    ...project,
    rubrosDetallados: { ...project.rubrosDetallados, [id]: { ...existing, ...patch } },
  };
}

/** Elimina un Rubro Detallado y, en cascada, sus Tarifas y asignaciones. */
export function removeRubroDetallado(project: ProjectData, id: string): ProjectData {
  const childIds = Object.values(project.tarifas)
    .filter((t) => t.parentId === id)
    .map((t) => t.id);
  const next = childIds.reduce((acc, childId) => removeTarifa(acc, childId), project);
  return { ...next, rubrosDetallados: omit(next.rubrosDetallados, id) };
}

// --- N5: Tarifa ---------------------------------------------------------------

export function addTarifa(
  project: ProjectData,
  parentId: string,
  supplier: string,
  unitCost: number,
  unit: TarifaUnit,
  id: string = generateId()
): ProjectData {
  return {
    ...project,
    tarifas: { ...project.tarifas, [id]: { id, parentId, supplier, unitCost, unit } },
  };
}

export function updateTarifa(
  project: ProjectData,
  id: string,
  patch: Partial<Pick<ProjectData['tarifas'][string], 'supplier' | 'unitCost' | 'unit'>>
): ProjectData {
  const existing = project.tarifas[id];
  if (!existing) return project;
  return { ...project, tarifas: { ...project.tarifas, [id]: { ...existing, ...patch } } };
}

/** Elimina una Tarifa y cualquier asignación (recursos_wbs) que la use. */
export function removeTarifa(project: ProjectData, id: string): ProjectData {
  const assignmentIds = Object.values(project.recursosWbs)
    .filter((a) => a.tarifaId === id)
    .map((a) => a.id);
  const recursosWbs = assignmentIds.reduce(
    (acc, aId) => omit(acc, aId),
    project.recursosWbs
  );
  return { ...project, tarifas: omit(project.tarifas, id), recursosWbs };
}

// --- Asignaciones (recursos_wbs) ---------------------------------------------

export function addAssignment(
  project: ProjectData,
  input: Omit<ResourceAssignment, 'id'>
): ProjectData {
  const id = generateId();
  return { ...project, recursosWbs: { ...project.recursosWbs, [id]: { ...input, id } } };
}

export function updateAssignment(
  project: ProjectData,
  id: string,
  patch: Partial<Omit<ResourceAssignment, 'id'>>
): ProjectData {
  const existing = project.recursosWbs[id];
  if (!existing) return project;
  return { ...project, recursosWbs: { ...project.recursosWbs, [id]: { ...existing, ...patch } } };
}

export function removeAssignment(project: ProjectData, id: string): ProjectData {
  return { ...project, recursosWbs: omit(project.recursosWbs, id) };
}

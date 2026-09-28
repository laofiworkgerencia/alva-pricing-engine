import { generateId } from './id';
import type { ProjectData, WbsNode } from './types';

function omit<T extends Record<string, unknown>>(record: T, id: string): T {
  const { [id]: _removed, ...rest } = record;
  return rest as T;
}

export function addWbsNode(
  project: ProjectData,
  input: Omit<WbsNode, 'id'>,
  id: string = generateId()
): ProjectData {
  return {
    ...project,
    elementosWbs: { ...project.elementosWbs, [id]: { ...input, id } },
  };
}

export function updateWbsNode(
  project: ProjectData,
  id: string,
  patch: Partial<Omit<WbsNode, 'id'>>
): ProjectData {
  const existing = project.elementosWbs[id];
  if (!existing) return project;
  return {
    ...project,
    elementosWbs: { ...project.elementosWbs, [id]: { ...existing, ...patch } },
  };
}

/** Elimina un nodo WBS y, en cascada, sus descendientes y las asignaciones de todos ellos. */
export function removeWbsNode(project: ProjectData, id: string): ProjectData {
  const childIds = Object.values(project.elementosWbs)
    .filter((n) => n.parentId === id)
    .map((n) => n.id);
  const afterChildren = childIds.reduce((acc, childId) => removeWbsNode(acc, childId), project);

  const assignmentIds = Object.values(afterChildren.recursosWbs)
    .filter((a) => a.elementoWbsId === id)
    .map((a) => a.id);
  const recursosWbs = assignmentIds.reduce((acc, aId) => omit(acc, aId), afterChildren.recursosWbs);

  return { ...afterChildren, elementosWbs: omit(afterChildren.elementosWbs, id), recursosWbs };
}

/** Busca el UUID de un nodo WBS por su código jerárquico (ej. "1.2"). */
export function findWbsIdByCode(project: ProjectData, code: string): string | null {
  return Object.values(project.elementosWbs).find((n) => n.code === code)?.id ?? null;
}

/** Resuelve el parentId de un código nuevo por su prefijo jerárquico ("1.2" → padre con code "1"). */
export function resolveParentIdFromCode(project: ProjectData, code: string): string | null {
  const lastDot = code.lastIndexOf('.');
  if (lastDot === -1) return null;
  return findWbsIdByCode(project, code.slice(0, lastDot));
}

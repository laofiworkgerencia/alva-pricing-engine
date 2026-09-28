import { addAssignment, addRubroDetallado, addRubroSecundario, addTarifa, updateRubroDetallado, updateTarifa } from './catalogOps';
import { generateId } from './id';
import { addWbsNode, findWbsIdByCode, removeWbsNode, resolveParentIdFromCode, updateWbsNode } from './wbsOps';
import type { LevelType, ProjectData, TarifaUnit, TimeUnit } from './types';

export interface AddResourceCommand {
  tipo: 'ADD_RESOURCE';
  wbs_id: string;
  tarifa_id?: string;
  nombre_recurso?: string;
  cantidad?: number;
  tiempo?: number;
  unidad_tiempo?: string;
  costo_unitario?: number;
  unidad?: string;
  rubro_principal?: string;
  rubro_secundario?: string;
}

export interface UpdateResourceCommand {
  tipo: 'UPDATE_RESOURCE';
  tarifa_id: string;
  costo_unitario?: number;
  nombre_recurso?: string;
}

export interface UpdateWbsCommand {
  tipo: 'UPDATE_WBS';
  wbs_id: string;
  nuevo_nombre?: string;
  nueva_duracion?: number;
}

export interface AddWbsCommand {
  tipo: 'ADD_WBS';
  codigo: string;
  nombre?: string;
  duracion?: number;
  nivel?: string;
  descripcion?: string;
}

export interface DeleteWbsCommand {
  tipo: 'DELETE_WBS';
  wbs_id: string;
}

export type AiCommand =
  | AddResourceCommand
  | UpdateResourceCommand
  | UpdateWbsCommand
  | AddWbsCommand
  | DeleteWbsCommand;

const VALID_TIME_UNITS: TimeUnit[] = ['Hora', 'Día', 'Semana', 'Mes', '-'];
const VALID_LEVEL_TYPES: LevelType[] = ['Fase', 'Actividad', 'Acción', 'Tarea'];

function coerceTimeUnit(raw: string | undefined): TimeUnit {
  return (VALID_TIME_UNITS as string[]).includes(raw ?? '') ? (raw as TimeUnit) : '-';
}

function inferLevelType(codigo: string, nivel: string | undefined): LevelType {
  if (nivel && (VALID_LEVEL_TYPES as string[]).includes(nivel)) return nivel as LevelType;
  const depth = codigo.split('.').length;
  if (depth === 1) return 'Fase';
  if (depth === 2) return 'Actividad';
  if (depth === 3) return 'Acción';
  return 'Tarea';
}

/** Elige el Rubro Principal (N2) destino: coincidencia por nombre, o "9. Otros", o el primero disponible. */
function findRubroPrincipalId(project: ProjectData, hint: string | undefined): string | null {
  const all = Object.values(project.rubrosPrincipales);
  if (all.length === 0) return null;
  if (hint) {
    const match = all.find((rp) => rp.name.toLowerCase().includes(hint.toLowerCase()));
    if (match) return match.id;
  }
  const otros = all.find((rp) => rp.id === 'n2-9') ?? all.find((rp) => rp.name.includes('Otros'));
  return (otros ?? all[0]).id;
}

/**
 * Aplica los comandos que el Asistente ALVA puede emitir (en un bloque JSON
 * oculto dentro de su respuesta) para modificar el proyecto: agregar/editar
 * recursos, y agregar/editar/eliminar nodos del WBS. Es una función pura:
 * no confía ciegamente en el texto generado por el LLM — cada comando se
 * valida contra el proyecto actual, y los que referencian algo inexistente
 * se omiten con una advertencia en vez de corromper el estado.
 */
export function applyAiCommands(
  project: ProjectData,
  commands: AiCommand[]
): { project: ProjectData; warnings: string[] } {
  const warnings: string[] = [];
  let next = project;

  for (const cmd of commands) {
    switch (cmd.tipo) {
      case 'ADD_RESOURCE': {
        if (!cmd.wbs_id || !next.elementosWbs[cmd.wbs_id]) {
          warnings.push(`ADD_RESOURCE: el nodo WBS "${cmd.wbs_id ?? ''}" no existe; se omite.`);
          break;
        }

        let tarifaId = cmd.tarifa_id && next.tarifas[cmd.tarifa_id] ? cmd.tarifa_id : undefined;

        if (!tarifaId) {
          const rubroPrincipalId = findRubroPrincipalId(next, cmd.rubro_principal);
          if (!rubroPrincipalId) {
            warnings.push('ADD_RESOURCE: el proyecto no tiene catálogo (Rubros Principales); se omite.');
            break;
          }
          const secId = generateId();
          const detId = generateId();
          tarifaId = generateId();
          next = addRubroSecundario(next, rubroPrincipalId, cmd.rubro_secundario || 'Asignación IA', secId);
          next = addRubroDetallado(next, secId, cmd.nombre_recurso || 'Recurso del Asistente', '', detId);
          next = addTarifa(
            next,
            detId,
            'Asistente ALVA',
            cmd.costo_unitario ?? 0,
            (cmd.unidad as TarifaUnit) || 'Unidad',
            tarifaId
          );
        }

        next = addAssignment(next, {
          elementoWbsId: cmd.wbs_id,
          tarifaId,
          quantity: cmd.cantidad ?? 1,
          quantityUnit: 'Persona',
          time: cmd.tiempo ?? 1,
          timeUnit: coerceTimeUnit(cmd.unidad_tiempo),
        });
        break;
      }

      case 'UPDATE_RESOURCE': {
        const tarifa = cmd.tarifa_id ? next.tarifas[cmd.tarifa_id] : undefined;
        if (!tarifa) {
          warnings.push(`UPDATE_RESOURCE: la tarifa "${cmd.tarifa_id ?? ''}" no existe; se omite.`);
          break;
        }
        if (cmd.costo_unitario !== undefined) {
          next = updateTarifa(next, cmd.tarifa_id, { unitCost: cmd.costo_unitario });
        }
        if (cmd.nombre_recurso !== undefined) {
          next = updateRubroDetallado(next, tarifa.parentId, { name: cmd.nombre_recurso });
        }
        break;
      }

      case 'UPDATE_WBS': {
        if (!cmd.wbs_id || !next.elementosWbs[cmd.wbs_id]) {
          warnings.push(`UPDATE_WBS: el nodo WBS "${cmd.wbs_id ?? ''}" no existe; se omite.`);
          break;
        }
        const patch: Partial<{ name: string; duration: number }> = {};
        if (cmd.nuevo_nombre !== undefined) patch.name = cmd.nuevo_nombre;
        if (cmd.nueva_duracion !== undefined) patch.duration = cmd.nueva_duracion;
        next = updateWbsNode(next, cmd.wbs_id, patch);
        break;
      }

      case 'ADD_WBS': {
        if (!cmd.codigo) {
          warnings.push('ADD_WBS: falta "codigo"; se omite.');
          break;
        }
        if (findWbsIdByCode(next, cmd.codigo)) {
          warnings.push(`ADD_WBS: ya existe un nodo con código "${cmd.codigo}"; se crea de todas formas.`);
        }
        const parentId = resolveParentIdFromCode(next, cmd.codigo);
        next = addWbsNode(next, {
          code: cmd.codigo,
          name: cmd.nombre || 'Nueva tarea (IA)',
          levelType: inferLevelType(cmd.codigo, cmd.nivel),
          parentId,
          isActive: true,
          startDay: 1,
          duration: cmd.duracion ?? 1,
          descGeneral: cmd.descripcion || '',
        });
        break;
      }

      case 'DELETE_WBS': {
        if (!cmd.wbs_id || !next.elementosWbs[cmd.wbs_id]) {
          warnings.push(`DELETE_WBS: el nodo WBS "${cmd.wbs_id ?? ''}" no existe; se omite.`);
          break;
        }
        next = removeWbsNode(next, cmd.wbs_id);
        break;
      }
    }
  }

  return { project: next, warnings };
}

const COMMAND_BLOCK_RE = /```json([\s\S]*?)```/;

/**
 * Extrae el bloque de comandos oculto (` ```json {"comandos":[...]} ``` `)
 * de la respuesta del Asistente, y devuelve el texto sin ese bloque para
 * mostrarlo al usuario. Un bloque ausente o malformado no es un error: el
 * asistente simplemente estaba conversando, sin modificar el proyecto.
 */
export function extractAiCommands(aiText: string): { displayText: string; commands: AiCommand[] } {
  const match = aiText.match(COMMAND_BLOCK_RE);
  if (!match) return { displayText: aiText.trim(), commands: [] };

  let commands: AiCommand[] = [];
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed?.comandos)) commands = parsed.comandos;
  } catch {
    // Bloque JSON malformado: se ignora y se muestra el texto tal cual.
  }

  return { displayText: aiText.replace(COMMAND_BLOCK_RE, '').trim(), commands };
}

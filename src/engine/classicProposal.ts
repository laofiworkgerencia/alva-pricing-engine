import { buildWbsTree, type PricingResult, type WbsTreeNode } from './pricingEngine';
import type { ProjectData } from './types';

/**
 * Datos derivados (puros, sin React/docx) para la pestaña "Propuesta
 * Clásica": la misma información que en el original alimentaba
 * `renderClassicQuotePreview()` y `generateWordDoc('classic')`, calculada
 * una sola vez y compartida entre la vista HTML y el export a .docx.
 */

export function getWbsLevel(code: string): number {
  return code.split('.').length;
}

function flattenTree(nodes: WbsTreeNode[]): WbsTreeNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

export interface ClassicProposalLine {
  id: string;
  code: string;
  name: string;
  isRoot: boolean;
  descGeneral: string;
  descSmart: string;
  descKpi: string;
  descAporte: string;
  descInsumos: string;
  descTecnica: string;
  deliverables: string[];
  cost: number;
  startDay: number;
  duration: number;
  endDay: number;
}

/**
 * Elementos del WBS visibles en la propuesta, filtrados por
 * `isActive`/`maxDetailLevel` igual que el original (filtro plano, no poda
 * de subárbol: un hijo dentro del nivel permitido se muestra aunque su
 * padre haya quedado fuera).
 */
export function buildClassicProposalLines(
  project: ProjectData,
  result: PricingResult
): ClassicProposalLine[] {
  const maxLevel = project.ofertaComercial.maxDetailLevel;
  const flat = flattenTree(buildWbsTree(project.elementosWbs));

  return flat
    .filter((n) => n.isActive !== false && getWbsLevel(n.code) <= maxLevel)
    .map((n) => {
      const schedule = result.scheduleByNode[n.id] ?? {
        startDay: n.startDay,
        duration: n.duration,
      };
      return {
        id: n.id,
        code: n.code,
        name: n.name,
        isRoot: getWbsLevel(n.code) === 1,
        descGeneral: n.descGeneral ?? '',
        descSmart: n.descSmart ?? '',
        descKpi: n.descKpi ?? '',
        descAporte: n.descAporte ?? '',
        descInsumos: n.descInsumos ?? '',
        descTecnica: n.descTecnica ?? '',
        deliverables: n.deliverable
          ? n.deliverable.split(' | ').filter((d) => d.trim() !== '')
          : [],
        cost: result.costByNode[n.id]?.total ?? 0,
        startDay: schedule.startDay,
        duration: schedule.duration,
        endDay: schedule.startDay + schedule.duration - 1,
      };
    });
}

export interface ClassicProposalMilestoneLine {
  id: string;
  name: string;
  percentage: number;
  amount: number;
  linkedNode?: { code: string; name: string; endDay: number };
}

/** Hitos con su monto calculado y, si están vinculados, el día estimado de entrega. */
export function buildClassicProposalMilestones(
  project: ProjectData,
  result: PricingResult
): ClassicProposalMilestoneLine[] {
  return project.ofertaComercial.milestones.map((m) => {
    const amount = result.milestoneAmounts.find((ma) => ma.id === m.id)?.amount ?? 0;
    const linkedWbsNode = m.linkedWbsId ? project.elementosWbs[m.linkedWbsId] : undefined;
    let linkedNode: ClassicProposalMilestoneLine['linkedNode'];
    if (linkedWbsNode) {
      const schedule = result.scheduleByNode[linkedWbsNode.id] ?? {
        startDay: linkedWbsNode.startDay,
        duration: linkedWbsNode.duration,
      };
      linkedNode = {
        code: linkedWbsNode.code,
        name: linkedWbsNode.name,
        endDay: schedule.startDay + schedule.duration - 1,
      };
    }
    return { id: m.id, name: m.name, percentage: m.percentage, amount, linkedNode };
  });
}

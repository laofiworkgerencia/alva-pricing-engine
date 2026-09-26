import { CATEGORIA_IDS } from './types';
import type {
  Catalog,
  Milestone,
  OfertaComercial,
  ResourceAssignment,
  WbsNode,
} from './types';
import { getCatTimeInDays, isTimeBasedUnit } from './timeUnits';

export interface WbsTreeNode extends WbsNode {
  children: WbsTreeNode[];
}

export interface NodeCost {
  /** Costo asignado directamente a este nodo (solo si es hoja y el recurso es COSTOS DIRECTOS). */
  direct: number;
  /** Costo recibido por prorrateo desde recursos de nodos padre / indirectos / gastos generales. */
  shared: number;
  /** direct + shared. */
  total: number;
}

/** Traza de auditoría: cuánto aportó una asignación puntual al costo de una hoja. */
export interface CostContribution {
  assignmentId: string;
  tarifaId: string;
  /** Nodo WBS al que fue asignado originalmente el recurso (puede ser un nodo padre). */
  sourceNodeId: string;
  /** Hoja que recibe el costo (igual a sourceNodeId cuando es directo). */
  leafId: string;
  amount: number;
  kind: 'direct' | 'shared';
  /** Solo para 'shared': el criterio de reparto usado. */
  basis?: 'duration' | 'directCost' | 'equal';
}

export interface PricingResult {
  /** Costo por nodo WBS, indexado por id. Incluye nodos padre e hijos. */
  costByNode: Record<string, NodeCost>;
  /** startDay/duration recalculados para nodos padre (rollup de sus hojas activas). */
  scheduleByNode: Record<string, { startDay: number; duration: number }>;
  /** Auditoría del prorrateo: qué asignación aportó cuánto a cada hoja, y cómo. */
  contributions: CostContribution[];
  summary: FinancialSummary;
  milestoneAmounts: Array<Milestone & { amount: number }>;
  warnings: string[];
}

export interface FinancialSummary {
  costBase: number;
  insurance: number;
  contingency: number;
  profit: number;
  subtotalGross: number;
  discount: number;
  total: number;
}

/**
 * Costo de una asignación de recurso, antes de saber a qué nodo(s) se distribuye.
 *
 * Unidades no temporales: costo = unitCost × quantity.
 * Unidades temporales: costo = unitCost × quantity × (time × dias(timeUnit) / dias(tarifa.unit)).
 */
export function calculateAssignmentCost(
  assignment: ResourceAssignment,
  unitCost: number,
  tarifaUnit: string
): number {
  if (!isTimeBasedUnit(tarifaUnit)) {
    return unitCost * assignment.quantity;
  }
  const tarifaDays = getCatTimeInDays(tarifaUnit);
  const assignmentDays = getCatTimeInDays(assignment.timeUnit);
  const factor = tarifaDays === 0 ? 0 : assignmentDays / tarifaDays;
  const timeMultiplier = assignment.time * factor;
  return unitCost * assignment.quantity * timeMultiplier;
}

export function buildWbsTree(nodes: Record<string, WbsNode>): WbsTreeNode[] {
  const byId = new Map<string, WbsTreeNode>();
  Object.values(nodes).forEach((n) => byId.set(n.id, { ...n, children: [] }));

  const roots: WbsTreeNode[] = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortByCode = (a: WbsTreeNode, b: WbsTreeNode) =>
    a.code.localeCompare(b.code, undefined, { numeric: true });
  const sortRec = (list: WbsTreeNode[]) => {
    list.sort(sortByCode);
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function collectActiveLeaves(node: WbsTreeNode): WbsTreeNode[] {
  if (node.children.length === 0) {
    return node.isActive ? [node] : [];
  }
  return node.children.flatMap(collectActiveLeaves);
}

/**
 * Recalcula startDay/duration de los nodos padre como el rango envolvente
 * (mín startDay → máx endDay) de sus hojas activas descendientes.
 */
export function rollupSchedule(
  roots: WbsTreeNode[]
): Record<string, { startDay: number; duration: number }> {
  const schedule: Record<string, { startDay: number; duration: number }> = {};

  const visit = (node: WbsTreeNode): { startDay: number; duration: number } => {
    if (node.children.length === 0) {
      const own = { startDay: node.startDay, duration: node.duration };
      schedule[node.id] = own;
      return own;
    }
    const childRanges = node.children.map(visit);
    const leaves = collectActiveLeaves(node);
    if (leaves.length === 0) {
      const own = { startDay: node.startDay, duration: node.duration };
      schedule[node.id] = own;
      return own;
    }
    const starts = childRanges.map((c) => c.startDay);
    const ends = childRanges.map((c) => c.startDay + c.duration);
    const startDay = Math.min(...starts);
    const duration = Math.max(...ends) - startDay;
    const own = { startDay, duration };
    schedule[node.id] = own;
    return own;
  };

  roots.forEach(visit);
  return schedule;
}

function isDirectCategory(categoryId: string): boolean {
  return categoryId === CATEGORIA_IDS.costosDirectos;
}

function isSharedCategory(categoryId: string): boolean {
  return (
    categoryId === CATEGORIA_IDS.costosIndirectos ||
    categoryId === CATEGORIA_IDS.gastosGenerales
  );
}

/** Recorre la cadena N5→N4→N3→N2→N1 hasta encontrar la categoría (N1) de una tarifa. */
function resolveCategoryId(tarifaId: string, catalog: Catalog): string | null {
  const tarifa = catalog.tarifas[tarifaId];
  if (!tarifa) return null;
  const n4 = catalog.rubrosDetallados[tarifa.parentId];
  if (!n4) return null;
  const n3 = catalog.rubrosSecundarios[n4.parentId];
  if (!n3) return null;
  const n2 = catalog.rubrosPrincipales[n3.parentId];
  if (!n2) return null;
  return catalog.categorias[n2.parentId]?.id ?? null;
}

export function calculate(
  wbsNodes: Record<string, WbsNode>,
  assignments: Record<string, ResourceAssignment>,
  catalog: Catalog,
  oferta: OfertaComercial
): PricingResult {
  const warnings: string[] = [];
  const roots = buildWbsTree(wbsNodes);
  const scheduleByNode = rollupSchedule(roots);

  const nodeById = new Map(Object.values(wbsNodes).map((n) => [n.id, n]));
  const childrenOf = new Map<string, WbsNode[]>();
  Object.values(wbsNodes).forEach((n) => {
    if (n.parentId) {
      childrenOf.set(n.parentId, [...(childrenOf.get(n.parentId) ?? []), n]);
    }
  });
  const isLeaf = (id: string) => !childrenOf.has(id);

  const costByNode: Record<string, NodeCost> = {};
  Object.keys(wbsNodes).forEach((id) => {
    costByNode[id] = { direct: 0, shared: 0, total: 0 };
  });

  const treeById = new Map<string, WbsTreeNode>();
  const indexTree = (list: WbsTreeNode[]) =>
    list.forEach((n) => {
      treeById.set(n.id, n);
      indexTree(n.children);
    });
  indexTree(roots);

  // Pasada 1: costo bruto de cada asignación + acumulación directa en hojas.
  const sharedAssignments: Array<{ assignment: ResourceAssignment; cost: number }> = [];
  const contributions: CostContribution[] = [];

  Object.values(assignments).forEach((assignment) => {
    const targetNode = nodeById.get(assignment.elementoWbsId);
    const tarifa = catalog.tarifas[assignment.tarifaId];
    if (!targetNode || !tarifa) {
      warnings.push(
        `Asignación ${assignment.id} referencia un nodo o tarifa inexistente; se omite.`
      );
      return;
    }

    const cost = calculateAssignmentCost(assignment, tarifa.unitCost, tarifa.unit);
    const categoryId = resolveCategoryId(assignment.tarifaId, catalog);

    const isDirect = categoryId ? isDirectCategory(categoryId) : false;
    const isShared = categoryId ? isSharedCategory(categoryId) : false;

    if (isDirect && isLeaf(targetNode.id)) {
      costByNode[targetNode.id].direct += cost;
      contributions.push({
        assignmentId: assignment.id,
        tarifaId: assignment.tarifaId,
        sourceNodeId: targetNode.id,
        leafId: targetNode.id,
        amount: cost,
        kind: 'direct',
      });
    } else {
      // Recursos bajo COSTOS INDIRECTOS/GASTOS GENERALES, o asignados a un nodo padre,
      // se prorratean entre las hojas activas descendientes.
      sharedAssignments.push({ assignment, cost });
      if (!isShared && !isDirect) {
        warnings.push(
          `Tarifa ${assignment.tarifaId} no resuelve una categoría N1 válida; tratada como costo compartido.`
        );
      }
    }
  });

  // Pasada 2: distribuir costos compartidos entre las hojas activas del nodo destino.
  sharedAssignments.forEach(({ assignment, cost }) => {
    const targetTree = treeById.get(assignment.elementoWbsId);
    if (!targetTree) return;

    let leaves = collectActiveLeaves(targetTree);
    if (leaves.length === 0 && targetTree.children.length === 0 && targetTree.isActive) {
      leaves = [targetTree];
    }
    const excluded = new Set(assignment.excludedIds ?? []);
    leaves = leaves.filter((l) => !excluded.has(l.id));

    if (leaves.length === 0) {
      warnings.push(
        `Asignación ${assignment.id} no tiene hojas activas para prorratear; el costo (${cost.toFixed(
          2
        )}) no se distribuyó.`
      );
      return;
    }

    const byDuration = assignment.isProrated === true;
    const weights = leaves.map((leaf) =>
      byDuration ? Math.max(leaf.duration, 0) : Math.max(costByNode[leaf.id].direct, 0)
    );
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    if (totalWeight === 0) {
      // Sin base de prorrateo (todas las hojas en 0): repartir en partes iguales.
      const equalShare = cost / leaves.length;
      leaves.forEach((leaf) => {
        costByNode[leaf.id].shared += equalShare;
        contributions.push({
          assignmentId: assignment.id,
          tarifaId: assignment.tarifaId,
          sourceNodeId: assignment.elementoWbsId,
          leafId: leaf.id,
          amount: equalShare,
          kind: 'shared',
          basis: 'equal',
        });
      });
      return;
    }

    leaves.forEach((leaf, i) => {
      const amount = cost * (weights[i] / totalWeight);
      costByNode[leaf.id].shared += amount;
      contributions.push({
        assignmentId: assignment.id,
        tarifaId: assignment.tarifaId,
        sourceNodeId: assignment.elementoWbsId,
        leafId: leaf.id,
        amount,
        kind: 'shared',
        basis: byDuration ? 'duration' : 'directCost',
      });
    });
  });

  // Totalizar y propagar hacia arriba (padres = suma de sus hojas).
  Object.keys(costByNode).forEach((id) => {
    const c = costByNode[id];
    c.total = c.direct + c.shared;
  });

  const rollupCost = (node: WbsTreeNode): number => {
    if (node.children.length === 0) {
      return costByNode[node.id].total;
    }
    const sum = node.children.reduce((acc, child) => acc + rollupCost(child), 0);
    costByNode[node.id].total = sum;
    return sum;
  };
  roots.forEach(rollupCost);

  const costBase = roots.reduce((acc, r) => acc + costByNode[r.id].total, 0);

  const summary = calculateFinancialSummary(costBase, oferta);
  const milestoneAmounts = calculateMilestones(oferta.milestones, summary.total, warnings);

  return { costByNode, scheduleByNode, contributions, summary, milestoneAmounts, warnings };
}

export function calculateFinancialSummary(
  costBase: number,
  oferta: Pick<
    OfertaComercial,
    'globalInsurance' | 'globalContingency' | 'globalProfit' | 'discountType' | 'discountValue'
  >
): FinancialSummary {
  const insurance = costBase * ((oferta.globalInsurance ?? 0) / 100);
  const contingency = costBase * ((oferta.globalContingency ?? 0) / 100);
  const profit = costBase * ((oferta.globalProfit ?? 0) / 100);
  const subtotalGross = costBase + insurance + contingency + profit;

  let discount = 0;
  if (oferta.discountType === 'percentage') {
    discount = subtotalGross * ((oferta.discountValue ?? 0) / 100);
  } else if (oferta.discountType === 'value') {
    discount = oferta.discountValue ?? 0;
  }

  const total = subtotalGross - discount;
  return { costBase, insurance, contingency, profit, subtotalGross, discount, total };
}

export function calculateMilestones(
  milestones: Milestone[],
  total: number,
  warnings: string[] = []
): Array<Milestone & { amount: number }> {
  const sum = milestones.reduce((acc, m) => acc + m.percentage, 0);
  if (milestones.length > 0 && Math.abs(sum - 100) > 0.01) {
    warnings.push(
      `Los porcentajes de los hitos suman ${sum}%, deberían sumar 100%.`
    );
  }
  return milestones.map((m) => ({ ...m, amount: total * (m.percentage / 100) }));
}

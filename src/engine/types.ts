// Modelo de datos del Cotizador ALVA, tal como lo documenta
// cotizador-alva-v3/.agents/skills/arquitecto-wbs/SKILL.md y supabase/schema.sql.
// Se mantiene compatible con los JSON exportados por la app original.

export type TimeUnit = 'Hora' | 'Día' | 'Semana' | 'Mes' | '-';

export type QuantityUnit =
  | 'Persona'
  | 'Equipo'
  | 'Kit'
  | 'Global'
  | 'Vehículo'
  | 'Lote'
  | 'Punto'
  | 'Evento'
  | 'Millar'
  | 'Lámina'
  | 'Unidad'
  | 'Oficina'
  | (string & {});

export type TarifaUnit =
  | 'Hora'
  | 'Día'
  | 'Semana'
  | 'Mes'
  | 'Global'
  | 'Kit'
  | 'Punto'
  | 'Evento'
  | 'Lote'
  | 'Millar'
  | 'Lámina'
  | 'Unidad'
  | 'Equipo'
  | 'Vehículo'
  | 'Oficina'
  | '% Remuneración';

export type LevelType = 'Fase' | 'Actividad' | 'Acción' | 'Tarea';

export type DiscountType = 'none' | 'percentage' | 'value';

/** N1 — Categoría (fija: 4 valores). */
export interface Categoria {
  id: string;
  name: string;
}

/** N2 — Rubro Principal (fijo: 16 valores). */
export interface RubroPrincipal {
  id: string;
  parentId: string;
  name: string;
}

/** N3 — Rubro Secundario (dinámico). */
export interface RubroSecundario {
  id: string;
  parentId: string;
  name: string;
}

/** N4 — Rubro Detallado (ítem cotizable del catálogo). */
export interface RubroDetallado {
  id: string;
  parentId: string;
  name: string;
  description?: string;
}

/** N5 — Tarifa (precio unitario de un proveedor específico). */
export interface Tarifa {
  id: string;
  parentId: string;
  supplier: string;
  unitCost: number;
  unit: TarifaUnit;
}

export interface Catalog {
  categorias: Record<string, Categoria>;
  rubrosPrincipales: Record<string, RubroPrincipal>;
  rubrosSecundarios: Record<string, RubroSecundario>;
  rubrosDetallados: Record<string, RubroDetallado>;
  tarifas: Record<string, Tarifa>;
}

/** Nodo del árbol WBS (Fase → Actividad → Acción → Tarea). */
export interface WbsNode {
  id: string;
  code: string;
  name: string;
  levelType: LevelType;
  parentId: string | null;
  isActive: boolean;

  descGeneral?: string;
  descSmart?: string;
  descKpi?: string;
  descAporte?: string;
  descInsumos?: string;
  descTecnica?: string;

  deliverable?: string;
  startDay: number;
  duration: number;
}

/** Asignación de un recurso (tarifa N5) a un nodo WBS. */
export interface ResourceAssignment {
  id: string;
  elementoWbsId: string;
  tarifaId: string;
  quantity: number;
  quantityUnit: QuantityUnit;
  time: number;
  timeUnit: TimeUnit;
  /** Fuerza distribución por duración en vez de por costo directo. */
  isProrated?: boolean;
  /** UUIDs de nodos WBS excluidos del prorrateo de este recurso. */
  excludedIds?: string[];
  observations?: string;
}

export interface Milestone {
  id: string;
  name: string;
  percentage: number;
  linkedWbsId?: string;
}

export interface OfertaComercial {
  version: string;
  clientName: string;
  projectName: string;
  projectNameFull: string;
  sbu: number;
  date: string;
  quoteType: string;
  maxDetailLevel: number;
  introText: string;
  discountType: DiscountType;
  discountValue: number;
  quoteSequence: string;
  targetBudget: number;
  globalInsurance: number;
  globalContingency: number;
  globalProfit: number;
  milestones: Milestone[];
}

export interface ProjectData {
  version: string;
  categorias: Record<string, Categoria>;
  rubrosPrincipales: Record<string, RubroPrincipal>;
  rubrosSecundarios: Record<string, RubroSecundario>;
  rubrosDetallados: Record<string, RubroDetallado>;
  tarifas: Record<string, Tarifa>;
  elementosWbs: Record<string, WbsNode>;
  recursosWbs: Record<string, ResourceAssignment>;
  ofertaComercial: OfertaComercial;
}

/** Envoltorio de importación/exportación (formato "LaOfi S.A.S."). */
export interface ProjectFile {
  empresa: 'LaOfi S.A.S.';
  version: string;
  timestamp: string;
  data: ProjectData;
}

/** IDs fijos de las 4 categorías N1 (siempre presentes). */
export const CATEGORIA_IDS = {
  costosDirectos: 'n1-1',
  costosIndirectos: 'n1-2',
  gastosGenerales: 'n1-3',
  utilidad: 'n1-4',
} as const;

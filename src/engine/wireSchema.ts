import { z } from 'zod';

// Esquema del formato de intercambio JSON tal como lo produce/consume el
// Cotizador ALVA v3 original (ver .agents/skills/arquitecto-wbs/SKILL.md,
// Parte 3). Los nombres de campo son intencionalmente inconsistentes
// (mezcla snake_case / camelCase) porque así es el formato real con el que
// hay que ser compatible — no una elección de este proyecto.

export const wireCategoriaSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const wireRubroPrincipalSchema = z.object({
  id: z.string(),
  parentId: z.string(),
  name: z.string(),
});

export const wireRubroSecundarioSchema = z.object({
  id: z.string(),
  parentId: z.string(),
  name: z.string(),
});

export const wireRubroDetalladoSchema = z.object({
  id: z.string(),
  parentId: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export const wireTarifaSchema = z.object({
  id: z.string(),
  parentId: z.string(),
  supplier: z.string(),
  unitCost: z.number(),
  unit: z.string(),
});

export const wireWbsNodeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  levelType: z.enum(['Fase', 'Actividad', 'Acción', 'Tarea']),
  parentId: z.string().nullable(),
  isActive: z.boolean().default(true),
  desc_general: z.string().optional().default(''),
  desc_smart: z.string().optional().default(''),
  desc_kpi: z.string().optional().default(''),
  desc_aporte: z.string().optional().default(''),
  desc_insumos: z.string().optional().default(''),
  desc_tecnica: z.string().optional().default(''),
  deliverable: z.string().optional().default(''),
  // La app original no persiste startDay (no tiene Gantt con fechas
  // almacenadas) — ausente en exports reales de producción. Se
  // rellena con 1 en fromWire() cuando falta.
  startDay: z.number().optional(),
  duration: z.number(),
});

export const wireMilestoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  percentage: z.number(),
  linkedWbsId: z.string().optional().default(''),
});

export const wireResourceAssignmentSchema = z.object({
  id: z.string(),
  elemento_wbs_id: z.string(),
  tarifa_id: z.string(),
  quantity: z.number(),
  // Ausente en exports reales de producción (la app original no la usa
  // para el cálculo); se rellena con 'Persona' en fromWire() cuando falta.
  quantityUnit: z.string().optional(),
  time: z.number(),
  timeUnit: z.string(),
  isLocked: z.boolean().optional(),
  isProrated: z.boolean().optional(),
  excluded_ids: z.array(z.string()).optional(),
  observations: z.string().optional(),
});

export const wireOfertaComercialSchema = z.object({
  version: z.string(),
  clientName: z.string(),
  projectName: z.string(),
  projectNameFull: z.string(),
  sbu: z.number(),
  date: z.string(),
  quoteType: z.string(),
  maxDetailLevel: z.number(),
  introText: z.string(),
  discountType: z.enum(['none', 'percentage', 'value']),
  discountValue: z.number(),
  quoteSequence: z.string(),
  targetBudget: z.number(),
  globalInsurance: z.number(),
  globalContingency: z.number(),
  globalProfit: z.number(),
  milestones: z.array(wireMilestoneSchema),
});

export const wireNarrativeSectionSchema = z.object({
  texto: z.string(),
});

export const wireProjectDataSchema = z.object({
  version: z.string(),
  categorias: z.record(z.string(), wireCategoriaSchema),
  rubros_principales: z.record(z.string(), wireRubroPrincipalSchema),
  rubros_secundarios: z.record(z.string(), wireRubroSecundarioSchema),
  rubros_detallados: z.record(z.string(), wireRubroDetalladoSchema),
  tarifas: z.record(z.string(), wireTarifaSchema),
  elementos_wbs: z.record(z.string(), wireWbsNodeSchema),
  recursos_wbs: z.record(z.string(), wireResourceAssignmentSchema),
  oferta_comercial: wireOfertaComercialSchema,
  /** Opcional: la app original no lo exportaba, así que los proyectos viejos no lo traen. */
  narrativa: z.record(z.string(), wireNarrativeSectionSchema).optional(),
});

/** El importador original solo exige `empresa === 'LaOfi S.A.S.'` y que `data.elementos_wbs` exista. */
export const wireProjectFileSchema = z.object({
  empresa: z.literal('LaOfi S.A.S.'),
  version: z.string(),
  timestamp: z.string(),
  data: wireProjectDataSchema,
});

export type WireProjectFile = z.infer<typeof wireProjectFileSchema>;
export type WireProjectData = z.infer<typeof wireProjectDataSchema>;

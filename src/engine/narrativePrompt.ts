import type { NarrativeSectionId } from './types';

export interface NarrativeSectionDef {
  id: NarrativeSectionId;
  title: string;
  hint: string;
}

/** Las 2 secciones fijas del NarrativeEditor original (SKILL.md / ProposalModule). */
export const NARRATIVE_SECTIONS: NarrativeSectionDef[] = [
  {
    id: 'alerta_normativa',
    title: 'Alerta Normativa',
    hint: 'El detonador del proyecto. ¿Qué leyes obligan al cliente a contratar esto?',
  },
  {
    id: 'solucion',
    title: 'La Solución (Visión y Metodología)',
    hint: 'Cómo el proyecto resuelve el problema planteado.',
  },
];

export interface NarrativeContext {
  clientName?: string;
  projectNameFull?: string;
  projectType?: string;
  areaTotalKm2?: number;
  edificacionesTotal?: number;
}

/**
 * Construye el prompt para redactar una sección narrativa de la propuesta.
 * Es una función pura (sin red) para poder: (a) correrla en el servidor antes
 * de llamar al LLM, y (b) reutilizarla en el cliente para el modo de
 * respaldo "copia este prompt" cuando no hay backend configurado.
 */
export function buildNarrativePrompt(
  context: NarrativeContext,
  sectionId: NarrativeSectionId
): string {
  const section = NARRATIVE_SECTIONS.find((s) => s.id === sectionId);
  const sectionLabel = section?.title ?? sectionId;

  return `Eres el "ALVA Redactor", un experto en redacción de propuestas B2B para consultoría en geomática, catastro y soluciones territoriales en Ecuador.

DATOS DEL PROYECTO:
- Cliente: ${context.clientName || 'No especificado'}
- Nombre: ${context.projectNameFull || 'No especificado'}
- Tipo: ${context.projectType || 'Consultoría en Geomática'}
- Área: ${context.areaTotalKm2 ? context.areaTotalKm2 + ' km2' : 'No especificada'}
- Universo: ${context.edificacionesTotal ? context.edificacionesTotal + ' edificaciones' : 'No especificado'}

SECCIÓN REQUERIDA:
Por favor, redacta el texto correspondiente a la sección: "${sectionLabel}".
${section ? `Contexto de la sección: ${section.hint}` : ''}

INSTRUCCIONES DE ESTILO:
- Utiliza un tono persuasivo, profesional y técnico.
- Apóyate en técnicas de neuroventas (ej: anclar el problema antes que la solución, destacar el marco legal como mandato ineludible).
- Devuelve el resultado en formato Markdown puro sin introducciones ni comentarios extras.`;
}

// Firma mínima compatible con el runtime Node de Vercel, sin depender de
// @vercel/node solo por los tipos.
interface MinimalRequest {
  method?: string;
  body: unknown;
}

interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
}

// --- Prompt narrativo -----------------------------------------------------
//
// Copia autocontenida de src/engine/narrativePrompt.ts. Vercel empaqueta las
// funciones de api/ por separado y en producción NO resolvió el import
// relativo hacia ../src/engine/* (ERR_MODULE_NOT_FOUND: el archivo nunca se
// incluyó en el bundle desplegado) — por eso esta función no importa nada
// fuera de api/. api/generate-narrative.test.ts verifica que esta copia se
// mantenga idéntica a la del motor.

export type NarrativeSectionId = 'alerta_normativa' | 'solucion';

export interface NarrativeContext {
  clientName?: string;
  projectNameFull?: string;
  projectType?: string;
  areaTotalKm2?: number;
  edificacionesTotal?: number;
}

interface NarrativeSectionDef {
  id: NarrativeSectionId;
  title: string;
  hint: string;
}

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

// ---------------------------------------------------------------------------

const VALID_SECTIONS = new Set<NarrativeSectionId>(['alerta_normativa', 'solucion']);

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Genera el texto de una sección narrativa de la propuesta llamando a Gemini
 * con la API key del servidor (GEMINI_API_KEY). La key nunca llega al cliente:
 * el navegador solo llama a este endpoint.
 */
export default async function handler(req: MinimalRequest, res: MinimalResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido, usa POST.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY no está configurada en el servidor.' });
    return;
  }

  const body = (typeof req.body === 'string' ? safeParseJson(req.body) : req.body) as
    | { section?: string; context?: NarrativeContext }
    | null;

  const section = body?.section;
  if (!section || !VALID_SECTIONS.has(section as NarrativeSectionId)) {
    res
      .status(400)
      .json({ error: `"section" debe ser una de: ${[...VALID_SECTIONS].join(', ')}.` });
    return;
  }

  const prompt = buildNarrativePrompt(body?.context ?? {}, section as NarrativeSectionId);

  try {
    const upstream = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 1024 },
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      const message =
        (data as { error?: { message?: string } })?.error?.message ??
        `Error ${upstream.status} desde Gemini.`;
      res.status(upstream.status).json({ error: message });
      return;
    }

    const text = (
      data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    )?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== 'string') {
      res.status(502).json({ error: 'Respuesta inesperada de Gemini (sin texto generado).' });
      return;
    }

    res.status(200).json({ text });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Error al contactar a Gemini.' });
  }
}

import { buildNarrativePrompt, type NarrativeContext } from '../src/engine/narrativePrompt';
import type { NarrativeSectionId } from '../src/engine/types';

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

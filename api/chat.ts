// Firma mínima compatible con el runtime Node de Vercel, sin depender de
// @vercel/node solo por los tipos. Autocontenida a propósito: un import
// relativo hacia ../src/engine/* no se empaquetó en producción para
// api/generate-narrative.ts (ver el comentario ahí) — este archivo no
// repite ese error. El prompt de sistema y el parseo de comandos IA se
// arman en el cliente (con el motor, vía Vite) y viajan ya completos en
// el body; este endpoint solo agrega la API key y reenvía a Gemini.

interface MinimalRequest {
  method?: string;
  body: unknown;
}

interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
}

interface ChatPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface ChatContent {
  role: 'user' | 'model';
  parts: ChatPart[];
}

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isValidContents(value: unknown): value is ChatContent[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (c) =>
        c &&
        typeof c === 'object' &&
        (c.role === 'user' || c.role === 'model') &&
        Array.isArray((c as ChatContent).parts)
    )
  );
}

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
    | { systemPrompt?: string; contents?: unknown }
    | null;

  if (!isValidContents(body?.contents)) {
    res.status(400).json({ error: '"contents" debe ser un arreglo no vacío de mensajes {role, parts}.' });
    return;
  }

  try {
    const upstream = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: body?.systemPrompt ? { parts: [{ text: body.systemPrompt }] } : undefined,
        contents: body.contents,
        generationConfig: { temperature: 0.4, topK: 40, topP: 0.95, maxOutputTokens: 2048 },
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

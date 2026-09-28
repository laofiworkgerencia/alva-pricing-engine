import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './chat';

function mockResponse() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
    },
  };
  return res;
}

const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  process.env.GEMINI_API_KEY = ORIGINAL_KEY;
  vi.unstubAllGlobals();
});

describe('chat handler', () => {
  it('rechaza métodos distintos de POST', async () => {
    const res = mockResponse();
    await handler({ method: 'GET', body: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('responde 500 si falta GEMINI_API_KEY', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = mockResponse();
    await handler({ method: 'POST', body: { contents: [{ role: 'user', parts: [{ text: 'hola' }] }] } }, res);
    expect(res.statusCode).toBe(500);
  });

  it('rechaza un body sin "contents" válido', async () => {
    const res = mockResponse();
    await handler({ method: 'POST', body: { contents: [] } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('reenvía systemPrompt + contents a Gemini y devuelve el texto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Listo, lo hice.' }] } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = mockResponse();
    await handler(
      {
        method: 'POST',
        body: {
          systemPrompt: 'Eres el Asistente ALVA.',
          contents: [{ role: 'user', parts: [{ text: 'Agrega un topógrafo' }] }],
        },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: 'Listo, lo hice.' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('key=test-key');
    const sentBody = JSON.parse(options.body);
    expect(sentBody.systemInstruction.parts[0].text).toBe('Eres el Asistente ALVA.');
    expect(sentBody.contents[0].parts[0].text).toBe('Agrega un topógrafo');
  });

  it('propaga el error de Gemini con su status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Cuota excedida' } }),
      })
    );

    const res = mockResponse();
    await handler(
      { method: 'POST', body: { contents: [{ role: 'user', parts: [{ text: 'hola' }] }] } },
      res
    );
    expect(res.statusCode).toBe(429);
    expect((res.body as { error: string }).error).toBe('Cuota excedida');
  });

  it('soporta mensajes con imágenes (inlineData) en las parts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'Veo la imagen.' }] } }] }),
      })
    );

    const res = mockResponse();
    await handler(
      {
        method: 'POST',
        body: {
          contents: [
            { role: 'user', parts: [{ text: 'Analiza esto' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] },
          ],
        },
      },
      res
    );
    expect(res.statusCode).toBe(200);
  });
});

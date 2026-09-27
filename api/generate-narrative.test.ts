import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './generate-narrative';

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

describe('generate-narrative handler', () => {
  it('rechaza métodos distintos de POST', async () => {
    const res = mockResponse();
    await handler({ method: 'GET', body: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('responde 500 si falta GEMINI_API_KEY en el servidor', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = mockResponse();
    await handler({ method: 'POST', body: { section: 'solucion' } }, res);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toContain('GEMINI_API_KEY');
  });

  it('rechaza una sección inválida', async () => {
    const res = mockResponse();
    await handler({ method: 'POST', body: { section: 'no-existe' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('llama a Gemini con el prompt construido y devuelve el texto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Texto generado.' }] } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = mockResponse();
    await handler(
      { method: 'POST', body: { section: 'alerta_normativa', context: { clientName: 'Cliente X' } } },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: 'Texto generado.' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('key=test-key');
    const sentBody = JSON.parse(options.body);
    expect(sentBody.contents[0].parts[0].text).toContain('Cliente X');
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
    await handler({ method: 'POST', body: { section: 'solucion' } }, res);
    expect(res.statusCode).toBe(429);
    expect((res.body as { error: string }).error).toBe('Cuota excedida');
  });

  it('acepta el body como string JSON (algunos runtimes no lo parsean)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
      })
    );

    const res = mockResponse();
    await handler({ method: 'POST', body: JSON.stringify({ section: 'solucion' }) }, res);
    expect(res.statusCode).toBe(200);
  });
});

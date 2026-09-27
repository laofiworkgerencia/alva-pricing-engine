import { useState } from 'react';
import {
  NARRATIVE_SECTIONS,
  buildNarrativePrompt,
  updateNarrativeSection,
  type NarrativeSectionId,
  type ProjectData,
} from './engine';

interface SectionUiState {
  generating: boolean;
  error: string | null;
  fallbackPrompt: string | null;
}

const EMPTY_UI_STATE: SectionUiState = { generating: false, error: null, fallbackPrompt: null };

export default function PropuestaNarrativaView({
  project,
  onChange,
}: {
  project: ProjectData;
  onChange: (next: ProjectData) => void;
}) {
  const [uiState, setUiState] = useState<Record<string, SectionUiState>>({});

  const stateFor = (id: NarrativeSectionId): SectionUiState => uiState[id] ?? EMPTY_UI_STATE;
  const patchState = (id: NarrativeSectionId, patch: Partial<SectionUiState>) =>
    setUiState((prev) => ({ ...prev, [id]: { ...stateFor(id), ...patch } }));

  const generate = async (sectionId: NarrativeSectionId) => {
    patchState(sectionId, { generating: true, error: null, fallbackPrompt: null });

    const context = {
      clientName: project.ofertaComercial.clientName,
      projectNameFull: project.ofertaComercial.projectNameFull || project.ofertaComercial.projectName,
    };

    try {
      const response = await fetch('/api/generate-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: sectionId, context }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? `El servidor respondió ${response.status}.`);
      }

      const data = (await response.json()) as { text: string };
      onChange(updateNarrativeSection(project, sectionId, data.text));
      patchState(sectionId, { generating: false });
    } catch (err) {
      // Sin backend desplegado (ej. `npm run dev` sin `/api`) o con error del
      // servidor: se ofrece el prompt para copiar y pegar manualmente, igual
      // que hacía el NarrativeEditor original cuando faltaba la API key.
      const prompt = buildNarrativePrompt(context, sectionId);
      patchState(sectionId, {
        generating: false,
        error: err instanceof Error ? err.message : 'No se pudo generar el texto.',
        fallbackPrompt: prompt,
      });
    }
  };

  return (
    <div className="narrativa">
      <section className="panel">
        <h2>Propuesta Narrativa</h2>
        <p className="hint">
          Redacción asistida por IA de la propuesta. El texto se guarda con el proyecto
          (a diferencia del original, donde vivía fuera del archivo exportado). El
          botón llama a <code>/api/generate-narrative</code>, un endpoint propio que
          guarda la API key en el servidor — nunca en el navegador.
        </p>

        {NARRATIVE_SECTIONS.map((section) => {
          const state = stateFor(section.id);
          const texto = project.narrativa[section.id]?.texto ?? '';
          return (
            <div key={section.id} className="narrative-section">
              <h3>{section.title}</h3>
              <p className="hint">{section.hint}</p>
              <textarea
                rows={6}
                placeholder="Escribe o genera el texto con IA..."
                value={texto}
                onChange={(e) => onChange(updateNarrativeSection(project, section.id, e.target.value))}
              />
              <div className="narrative-actions">
                <button
                  type="button"
                  className="ai-btn"
                  disabled={state.generating}
                  onClick={() => generate(section.id)}
                >
                  {state.generating ? 'Generando…' : '✨ Generar con IA'}
                </button>
              </div>

              {state.error && (
                <div className="error-banner narrative-error">
                  No se pudo generar automáticamente: {state.error}
                </div>
              )}

              {state.fallbackPrompt && (
                <div className="fallback-prompt">
                  <p className="hint">
                    Copia este prompt y pégalo manualmente en tu asistente de IA
                    preferido, luego pega la respuesta arriba:
                  </p>
                  <textarea readOnly rows={8} value={state.fallbackPrompt} />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(state.fallbackPrompt ?? '')}
                  >
                    Copiar prompt
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

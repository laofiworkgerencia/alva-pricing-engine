import { useRef, useState, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  applyAiCommands,
  buildChatSystemPrompt,
  extractAiCommands,
  type ProjectData,
} from './engine';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  isError?: boolean;
}

const GREETING_EXAMPLES = [
  'Agrega un especialista SIG con un sueldo de 1500 a la Fase 1',
  'Sube el costo del topógrafo a 2000',
  'Crea una tarea "1.3 Control de calidad" de 10 días',
];

export default function AsistenteAlvaView({
  project,
  onChange,
}: {
  project: ProjectData;
  onChange: (next: ProjectData) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastWarnings, setLastWarnings] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: 'user', text };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput('');
    setLastWarnings([]);
    setLoading(true);

    const contents = history.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: buildChatSystemPrompt(project), contents }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? `El servidor respondió ${response.status}.`);
      }

      const data = (await response.json()) as { text: string };
      const { displayText, commands } = extractAiCommands(data.text);

      if (commands.length > 0) {
        const { project: nextProject, warnings } = applyAiCommands(project, commands);
        onChange(nextProject);
        setLastWarnings(warnings);
      }

      setMessages([...history, { role: 'model', text: displayText || '(sin respuesta de texto)' }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo contactar al Asistente ALVA.';
      setMessages([...history, { role: 'model', text: `❌ ${message}`, isError: true }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="asistente">
      <section className="panel chat-panel">
        <div className="chat-header">
          <h2>Asistente ALVA</h2>
          <p className="hint">
            Puede modificar el proyecto por ti: agregar/editar recursos y tareas del WBS.
            Llama a <code>/api/chat</code> con la misma API key del servidor que usa la
            Propuesta Narrativa.
          </p>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>¡Hola! Soy ALVA, tu asistente para el presupuesto y el cronograma.</p>
              <p className="hint">Prueba con algo como:</p>
              <ul>
                {GREETING_EXAMPLES.map((ex) => (
                  <li key={ex}>
                    <button type="button" className="example-chip" onClick={() => setInput(ex)}>
                      {ex}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((m, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i} className={`chat-bubble-row ${m.role}`}>
              <div className={`chat-bubble ${m.role}${m.isError ? ' error' : ''}`}>
                {m.role === 'model' ? (
                  <ReactMarkdown>{m.text}</ReactMarkdown>
                ) : (
                  <span className="user-text">{m.text}</span>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="chat-bubble-row model">
              <div className="chat-bubble model loading">Procesando…</div>
            </div>
          )}
        </div>

        {lastWarnings.length > 0 && (
          <div className="chat-warnings">
            {lastWarnings.map((w) => (
              <div key={w}>⚠️ {w}</div>
            ))}
          </div>
        )}

        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Escribe tu petición al Asistente ALVA…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button type="button" onClick={send} disabled={loading || !input.trim()}>
            Enviar
          </button>
        </div>
      </section>
    </div>
  );
}

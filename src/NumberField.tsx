import { useState } from 'react';

/**
 * Input numérico para editar un valor ya existente. Mantiene un borrador de
 * texto local para no perder lo que el usuario está escribiendo (ej. el "."
 * de "100.5") cada vez que `Number(...)` se recalcula en cada tecla.
 */
export default function NumberField({
  value,
  onCommit,
  className,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [prevValue, setPrevValue] = useState(value);
  const [draft, setDraft] = useState(String(value));

  // Ajuste de estado durante el render (patrón recomendado por React en vez
  // de un useEffect) cuando `value` cambia por una razón externa al propio
  // campo (ej. se cargó otro proyecto), sin pisar lo que el usuario escribe.
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(String(value));
  }

  return (
    <input
      type="number"
      className={className}
      value={draft}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text);
        if (text.trim() !== '' && !Number.isNaN(n)) {
          onCommit(n);
        }
      }}
    />
  );
}

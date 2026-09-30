import { useEffect, useState } from 'react';
import {
  cloudEnabled,
  deleteProjectFromCloud,
  listCloudProjects,
  loadProjectFromCloud,
  saveProjectToCloud,
  type CloudProjectSummary,
} from './cloudStore';
import type { ProjectData } from './engine';

/**
 * Guardar/listar/abrir proyectos en el almacenamiento en la nube TEMPORAL
 * (ver cloudStore.ts y README — tabla descartable, sin login todavía).
 * No se renderiza nada si VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY no están
 * configuradas (ej. en `npm run dev` local sin esas variables).
 */
export default function CloudPanel({
  project,
  cloudId,
  onOpenProject,
  onSaved,
}: {
  project: ProjectData | null;
  cloudId: string | null;
  onOpenProject: (project: ProjectData, cloudId: string) => void;
  onSaved: (cloudId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CloudProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listCloudProjects());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al listar proyectos en la nube.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!cloudEnabled) return null;

  const handleSave = async () => {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      const id = await saveProjectToCloud(project, cloudId);
      onSaved(id);
      if (open) await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar en la nube.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = async (id: string) => {
    setError(null);
    try {
      const p = await loadProjectFromCloud(id);
      onOpenProject(p, id);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al abrir el proyecto.');
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deleteProjectFromCloud(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar.');
    }
  };

  return (
    <>
      <button type="button" onClick={handleSave} disabled={!project || saving}>
        {saving ? 'Guardando...' : cloudId ? '☁ Actualizar en la nube' : '☁ Guardar en la nube'}
      </button>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        {open ? 'Cerrar lista' : '☁ Proyectos en la nube'}
      </button>

      {open && (
        <div className="cloud-panel">
          <p className="hint cloud-warning">
            ⚠ Almacenamiento temporal sin login: cualquiera con el link público de esta app
            podría ver estos proyectos. No subas aquí cotizaciones con datos confidenciales
            hasta que exista autenticación real.
          </p>
          {loading && <p className="hint">Cargando...</p>}
          {error && <div className="error-banner">{error}</div>}
          {!loading && items.length === 0 && !error && (
            <p className="hint">Todavía no hay proyectos guardados en la nube.</p>
          )}
          <ul className="cloud-list">
            {items.map((it) => (
              <li key={it.id} className={it.id === cloudId ? 'cloud-list-current' : ''}>
                <div>
                  <strong>{it.name}</strong>
                  {it.clientName && <span> — {it.clientName}</span>}
                  <div className="hint">
                    {it.quoteSequence} · actualizado{' '}
                    {new Date(it.updatedAt).toLocaleString('es-EC')}
                  </div>
                </div>
                <div className="cloud-list-actions">
                  <button type="button" onClick={() => handleOpen(it.id)}>
                    Abrir
                  </button>
                  <button type="button" className="danger-btn" onClick={() => handleDelete(it.id)}>
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

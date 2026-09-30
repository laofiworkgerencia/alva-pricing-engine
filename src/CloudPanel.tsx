import { useEffect, useState } from 'react';
import {
  cloudEnabled,
  deleteProjectFromCloud,
  getStoredCloudKey,
  listCloudProjects,
  loadProjectFromCloud,
  saveProjectToCloud,
  setStoredCloudKey,
  verifyCloudKey,
  type CloudProjectSummary,
} from './cloudStore';
import type { ProjectData } from './engine';

/**
 * Guardar/listar/abrir proyectos en el almacenamiento en la nube TEMPORAL
 * (ver cloudStore.ts y README). Protegido por una clave compartida (no es
 * login real) validada contra un hash en la base de datos.
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

  const [keyDraft, setKeyDraft] = useState('');
  const [keyChecking, setKeyChecking] = useState(false);
  const hasKey = Boolean(getStoredCloudKey());

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
    if (open && hasKey) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!cloudEnabled) return null;

  const handleVerifyAndSaveKey = async () => {
    setKeyChecking(true);
    setError(null);
    try {
      const ok = await verifyCloudKey(keyDraft);
      if (!ok) {
        setError('Clave incorrecta.');
        return;
      }
      setStoredCloudKey(keyDraft);
      setKeyDraft('');
      if (open) await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al verificar la clave.');
    } finally {
      setKeyChecking(false);
    }
  };

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
      <button type="button" onClick={handleSave} disabled={!project || !hasKey || saving}>
        {saving ? 'Guardando...' : cloudId ? '☁ Actualizar en la nube' : '☁ Guardar en la nube'}
      </button>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        {open ? 'Cerrar lista' : '☁ Proyectos en la nube'}
      </button>

      {open && (
        <div className="cloud-panel">
          <p className="hint cloud-warning">
            ⚠ Almacenamiento temporal, sin login real: protegido solo por una clave
            compartida. No subas aquí cotizaciones con datos realmente confidenciales.
          </p>

          <div className="cloud-key-form">
            <label>
              Clave compartida
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={hasKey ? 'Ya configurada — escribe para cambiarla' : 'Pide la clave a quien administra el proyecto'}
              />
            </label>
            <button
              type="button"
              onClick={handleVerifyAndSaveKey}
              disabled={!keyDraft || keyChecking}
            >
              {keyChecking ? 'Verificando...' : 'Guardar clave'}
            </button>
            {hasKey && <span className="cloud-key-status">🔑 Clave configurada en este navegador</span>}
          </div>

          {error && <div className="error-banner">{error}</div>}

          {!hasKey && (
            <p className="hint">Configura la clave compartida arriba para ver/guardar proyectos.</p>
          )}
          {hasKey && loading && <p className="hint">Cargando...</p>}
          {hasKey && !loading && items.length === 0 && !error && (
            <p className="hint">Todavía no hay proyectos guardados en la nube.</p>
          )}
          {hasKey && (
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
          )}
        </div>
      )}
    </>
  );
}

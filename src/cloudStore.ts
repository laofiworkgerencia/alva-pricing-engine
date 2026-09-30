import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseProjectFile, serializeProjectFileToWireJson, type ProjectData } from './engine';

// Almacenamiento en la nube en un schema de Postgres SEPARADO
// (`cotizador_temp`, dentro del proyecto `alva-ingenieria` de Supabase) —
// tablas relacionales reales por cada proyecto (WBS, catálogo, recursos,
// hitos, narrativa), no un blob JSON en una columna. Ver
// supabase/cotizador_temp.sql para el DDL completo y las funciones
// save_project()/load_project() que hacen la conversión con el mismo
// formato "wire" que ya usan el import/export locales — así el motor
// (parseProjectFile/serializeProjectFileToWireJson) no necesita cambios.
//
// Lo TEMPORAL es el schema (se migrará al modelo unificado de ALVA más
// adelante) — los proyectos guardados aquí son datos reales, no de
// prueba, y persisten normalmente mientras tanto.
//
// Sin login real todavía: el acceso se protege con una CLAVE COMPARTIDA
// (no por usuario) que viaja en el header `x-cotizador-key` y que tanto
// la política RLS de `projects` como las funciones save_project/
// load_project validan contra un hash guardado en la base de datos.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const CLOUD_KEY_STORAGE = 'alva-pricing-engine:cloud-key';

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function getStoredCloudKey(): string {
  try {
    return localStorage.getItem(CLOUD_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setStoredCloudKey(key: string): void {
  try {
    if (key) {
      localStorage.setItem(CLOUD_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(CLOUD_KEY_STORAGE);
    }
  } catch {
    // localStorage no disponible: la clave solo dura lo que dure esta pestaña.
  }
  cachedClient = null;
  cachedClientKey = null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedClient: SupabaseClient<any, any, any> | null = null;
let cachedClientKey: string | null = null;

/** Cliente apuntando al schema `cotizador_temp` (no `public`), con la clave compartida como header. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getClient(): SupabaseClient<any, any, any> {
  if (!cloudEnabled) {
    throw new Error('Nube no configurada: faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
  }
  const key = getStoredCloudKey();
  if (cachedClient && cachedClientKey === key) return cachedClient;
  cachedClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    db: { schema: 'cotizador_temp' },
    global: { headers: { 'x-cotizador-key': key } },
  });
  cachedClientKey = key;
  return cachedClient;
}

/** Valida la clave contra el hash guardado en la base (función en el schema `public`). */
export async function verifyCloudKey(key: string): Promise<boolean> {
  if (!cloudEnabled) {
    throw new Error('Nube no configurada: faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
  }
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data, error } = await client.rpc('cotizador_temp_check_key', { key });
  if (error) throw error;
  return data === true;
}

export interface CloudProjectSummary {
  id: string;
  name: string;
  clientName: string | null;
  quoteSequence: string | null;
  updatedAt: string;
}

function translateError(error: { code?: string; message: string }): never {
  if (error.code === '42501' || error.code === 'PGRST301') {
    throw new Error('Clave compartida incorrecta o no configurada.');
  }
  throw new Error(error.message);
}

export async function listCloudProjects(): Promise<CloudProjectSummary[]> {
  const client = getClient();
  const { data, error } = await client
    .from('projects')
    .select('id, project_name, client_name, quote_sequence, updated_at')
    .order('updated_at', { ascending: false });
  if (error) translateError(error);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.project_name as string | null) || 'Proyecto sin nombre',
    clientName: (r.client_name as string | null) ?? null,
    quoteSequence: (r.quote_sequence as string | null) ?? null,
    updatedAt: r.updated_at as string,
  }));
}

/** Inserta si `cloudId` es null, reemplaza los datos si ya existe. Devuelve el id del proyecto. */
export async function saveProjectToCloud(
  project: ProjectData,
  cloudId: string | null
): Promise<string> {
  const client = getClient();
  const wireFile = JSON.parse(serializeProjectFileToWireJson(project));
  const { data, error } = await client.rpc('save_project', {
    p_id: cloudId,
    payload: wireFile.data,
  });
  if (error) translateError(error);
  return data as string;
}

export async function loadProjectFromCloud(id: string): Promise<ProjectData> {
  const client = getClient();
  const { data, error } = await client.rpc('load_project', { p_id: id });
  if (error) translateError(error);
  return parseProjectFile(data);
}

export async function deleteProjectFromCloud(id: string): Promise<void> {
  const client = getClient();
  const { error } = await client.from('projects').delete().eq('id', id);
  if (error) translateError(error);
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseProjectFile, serializeProjectFileToWireJson, type ProjectData } from './engine';

// Almacenamiento en la nube TEMPORAL (tabla `cotizador_temp_projects`,
// esquema descartable — ver README) mientras se diseña el esquema unificado
// de ALVA. Guarda el proyecto completo como el mismo JSON portable
// "LaOfi S.A.S." que ya usan el import/export locales.
//
// Sin login real todavía: el acceso se protege con una CLAVE COMPARTIDA
// (no por usuario) que viaja en el header `x-cotizador-key` y que la
// política RLS de la tabla valida contra un hash guardado en la base de
// datos (ver migración add_cotizador_temp_shared_key). Es una traba
// deliberadamente simple — no reemplaza autenticación real — pensada
// para que un desconocido con la anon key pública no pueda listar/editar
// las cotizaciones mientras se prueba la app.

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

let cachedClient: SupabaseClient | null = null;
let cachedClientKey: string | null = null;

function getClient(): SupabaseClient {
  if (!cloudEnabled) {
    throw new Error('Nube no configurada: faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
  }
  const key = getStoredCloudKey();
  if (cachedClient && cachedClientKey === key) return cachedClient;
  cachedClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { 'x-cotizador-key': key } },
  });
  cachedClientKey = key;
  return cachedClient;
}

/** Valida la clave contra el hash guardado en la base, sin intentar leer/escribir proyectos. */
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

function translateRlsError(error: { code?: string; message: string }): never {
  if (error.code === '42501' || error.code === 'PGRST301') {
    throw new Error('Clave compartida incorrecta o no configurada.');
  }
  throw new Error(error.message);
}

export async function listCloudProjects(): Promise<CloudProjectSummary[]> {
  const client = getClient();
  const { data, error } = await client
    .from('cotizador_temp_projects')
    .select('id, name, client_name, quote_sequence, updated_at')
    .order('updated_at', { ascending: false });
  if (error) translateRlsError(error);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    clientName: (r.client_name as string | null) ?? null,
    quoteSequence: (r.quote_sequence as string | null) ?? null,
    updatedAt: r.updated_at as string,
  }));
}

/** Inserta si `cloudId` es null, actualiza si ya existe. Devuelve el id de la fila. */
export async function saveProjectToCloud(
  project: ProjectData,
  cloudId: string | null
): Promise<string> {
  const client = getClient();
  const wireJson = JSON.parse(serializeProjectFileToWireJson(project));
  const row = {
    name: project.ofertaComercial.projectName || 'Proyecto sin nombre',
    client_name: project.ofertaComercial.clientName || null,
    quote_sequence: project.ofertaComercial.quoteSequence || null,
    data: wireJson,
  };

  if (cloudId) {
    const { error } = await client.from('cotizador_temp_projects').update(row).eq('id', cloudId);
    if (error) translateRlsError(error);
    return cloudId;
  }

  const { data, error } = await client
    .from('cotizador_temp_projects')
    .insert(row)
    .select('id')
    .single();
  if (error) translateRlsError(error);
  return data.id as string;
}

export async function loadProjectFromCloud(id: string): Promise<ProjectData> {
  const client = getClient();
  const { data, error } = await client
    .from('cotizador_temp_projects')
    .select('data')
    .eq('id', id)
    .single();
  if (error) translateRlsError(error);
  return parseProjectFile(data.data);
}

export async function deleteProjectFromCloud(id: string): Promise<void> {
  const client = getClient();
  const { error } = await client.from('cotizador_temp_projects').delete().eq('id', id);
  if (error) translateRlsError(error);
}

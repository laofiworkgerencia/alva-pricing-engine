import { createClient } from '@supabase/supabase-js';
import { parseProjectFile, serializeProjectFileToWireJson, type ProjectData } from './engine';

// Almacenamiento en la nube TEMPORAL (tabla `cotizador_temp_projects`,
// esquema descartable — ver README) mientras se diseña el esquema unificado
// de ALVA. Guarda el proyecto completo como el mismo JSON portable
// "LaOfi S.A.S." que ya usan el import/export locales.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabase = cloudEnabled ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!) : null;

function requireClient() {
  if (!supabase) {
    throw new Error(
      'Nube no configurada: faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.'
    );
  }
  return supabase;
}

export interface CloudProjectSummary {
  id: string;
  name: string;
  clientName: string | null;
  quoteSequence: string | null;
  updatedAt: string;
}

export async function listCloudProjects(): Promise<CloudProjectSummary[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('cotizador_temp_projects')
    .select('id, name, client_name, quote_sequence, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
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
  const client = requireClient();
  const wireJson = JSON.parse(serializeProjectFileToWireJson(project));
  const row = {
    name: project.ofertaComercial.projectName || 'Proyecto sin nombre',
    client_name: project.ofertaComercial.clientName || null,
    quote_sequence: project.ofertaComercial.quoteSequence || null,
    data: wireJson,
  };

  if (cloudId) {
    const { error } = await client.from('cotizador_temp_projects').update(row).eq('id', cloudId);
    if (error) throw error;
    return cloudId;
  }

  const { data, error } = await client
    .from('cotizador_temp_projects')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function loadProjectFromCloud(id: string): Promise<ProjectData> {
  const client = requireClient();
  const { data, error } = await client
    .from('cotizador_temp_projects')
    .select('data')
    .eq('id', id)
    .single();
  if (error) throw error;
  return parseProjectFile(data.data);
}

export async function deleteProjectFromCloud(id: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('cotizador_temp_projects').delete().eq('id', id);
  if (error) throw error;
}

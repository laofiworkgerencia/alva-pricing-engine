-- ============================================================================
-- cotizador_temp — schema relacional TEMPORAL del Cotizador ALVA
-- ============================================================================
-- Aplicado en el proyecto Supabase `alva-ingenieria` (organización ALVA
-- FINANZAS), vía Supabase MCP. Este archivo es un volcado de referencia
-- del estado actual — la fuente de verdad es la base de datos; si cambia
-- ahí, actualizar este archivo también.
--
-- Historial de migraciones (en orden):
--   create_cotizador_temp_projects                   (público, superada)
--   fix_cotizador_temp_set_updated_at_search_path
--   add_cotizador_temp_shared_key                     (clave compartida)
--   create_cotizador_temp_schema                      (schema relacional)
--   create_cotizador_temp_save_load_functions
--   create_cotizador_temp_load_function
--   fix_load_project_optional_fields
--   drop_old_cotizador_temp_projects_json_table        (se eliminó el blob JSON)
--   fix_load_project_invalid_errcode
--
-- LO TEMPORAL ES EL SCHEMA, NO LOS DATOS: `cotizador_temp` se migrará al
-- esquema unificado de ALVA (ALVA Finanzas + PMP as a Service) cuando esté
-- diseñado. Los proyectos guardados aquí mientras tanto son reales, no de
-- prueba, y persisten normalmente.
--
-- Diseño de acceso (sin login real todavía):
--   - `cotizador_temp.projects` tiene RLS con una política que exige una
--     CLAVE COMPARTIDA (header `x-cotizador-key`, validada contra un hash
--     bcrypt en `public.cotizador_temp_config` vía la función
--     `public.cotizador_temp_check_key`, ya creada en una migración
--     anterior a este schema).
--   - Las demás 8 tablas tienen RLS habilitado SIN ninguna política: están
--     completamente bloqueadas para acceso directo vía la API pública. El
--     único acceso es a través de `save_project()`/`load_project()`
--     (SECURITY DEFINER), que verifican la clave compartida ellas mismas.
--   - El schema está expuesto a PostgREST vía
--     `ALTER ROLE authenticator SET pgrst.db_schemas = 'public, cotizador_temp'`
--     (equivalente SQL del toggle "Exposed schemas" del dashboard).
--
-- Formato de intercambio: `save_project(p_id, payload)` recibe y
-- `load_project(p_id)` devuelve el mismo JSON "wire" (`data.*`, campos en
-- español mezcla snake_case/camelCase) que ya produce/consume
-- serializeProjectFileToWireJson()/parseProjectFile() en el frontend — el
-- motor de cálculo no necesitó ningún cambio.
-- ============================================================================

create schema if not exists cotizador_temp;

-- ── Proyectos (cotizaciones) ────────────────────────────────────────────
create table cotizador_temp.projects (
  id uuid primary key default gen_random_uuid(),
  version text not null default '14.8',
  client_name text,
  project_name text,
  project_name_full text,
  sbu numeric,
  quote_date date,
  quote_type text,
  max_detail_level int not null default 4,
  intro_text text,
  discount_type text not null default 'none'
    check (discount_type in ('none','percentage','value')),
  discount_value numeric not null default 0,
  quote_sequence text,
  target_budget numeric not null default 0,
  global_insurance numeric not null default 0,
  global_contingency numeric not null default 0,
  global_profit numeric not null default 0,
  area_total_km2 numeric,
  poblacion_total numeric,
  hogares_total numeric,
  edificaciones_total numeric,
  notas_territoriales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cotizador_temp.narrativa_secciones (
  project_id uuid not null references cotizador_temp.projects(id) on delete cascade,
  section_id text not null check (section_id in ('alerta_normativa','solucion')),
  texto text not null,
  primary key (project_id, section_id)
);

-- ── Catálogo N1–N5 (por proyecto) ───────────────────────────────────────
create table cotizador_temp.categorias (
  project_id uuid not null references cotizador_temp.projects(id) on delete cascade,
  id text not null,
  name text not null,
  primary key (project_id, id)
);

create table cotizador_temp.rubros_principales (
  project_id uuid not null,
  id text not null,
  parent_id text not null,
  name text not null,
  primary key (project_id, id),
  foreign key (project_id, parent_id) references cotizador_temp.categorias(project_id, id) on delete cascade
);

create table cotizador_temp.rubros_secundarios (
  project_id uuid not null,
  id text not null,
  parent_id text not null,
  name text not null,
  primary key (project_id, id),
  foreign key (project_id, parent_id) references cotizador_temp.rubros_principales(project_id, id) on delete cascade
);

create table cotizador_temp.rubros_detallados (
  project_id uuid not null,
  id text not null,
  parent_id text not null,
  name text not null,
  description text,
  primary key (project_id, id),
  foreign key (project_id, parent_id) references cotizador_temp.rubros_secundarios(project_id, id) on delete cascade
);

create table cotizador_temp.tarifas (
  project_id uuid not null,
  id text not null,
  parent_id text not null,
  supplier text,
  unit_cost numeric not null default 0,
  unit text not null,
  primary key (project_id, id),
  foreign key (project_id, parent_id) references cotizador_temp.rubros_detallados(project_id, id) on delete cascade
);

-- ── WBS y asignaciones ───────────────────────────────────────────────────
create table cotizador_temp.elementos_wbs (
  project_id uuid not null references cotizador_temp.projects(id) on delete cascade,
  id text not null,
  parent_id text,
  code text not null,
  name text not null,
  level_type text not null check (level_type in ('Fase','Actividad','Acción','Tarea')),
  is_active boolean not null default true,
  desc_general text,
  desc_smart text,
  desc_kpi text,
  desc_aporte text,
  desc_insumos text,
  desc_tecnica text,
  deliverable text,
  start_day int not null default 1,
  duration int not null default 1,
  primary key (project_id, id),
  foreign key (project_id, parent_id) references cotizador_temp.elementos_wbs(project_id, id) on delete cascade
);

create table cotizador_temp.recursos_wbs (
  project_id uuid not null references cotizador_temp.projects(id) on delete cascade,
  id text not null,
  elemento_wbs_id text not null,
  tarifa_id text not null,
  quantity numeric not null default 1,
  quantity_unit text not null default 'Persona',
  time numeric not null default 1,
  time_unit text not null default 'Mes',
  is_prorated boolean not null default false,
  is_locked boolean,
  excluded_ids text[],
  observations text,
  primary key (project_id, id),
  foreign key (project_id, elemento_wbs_id) references cotizador_temp.elementos_wbs(project_id, id) on delete cascade,
  foreign key (project_id, tarifa_id) references cotizador_temp.tarifas(project_id, id) on delete cascade
);

create table cotizador_temp.milestones (
  project_id uuid not null references cotizador_temp.projects(id) on delete cascade,
  id text not null,
  name text not null,
  percentage numeric not null default 0,
  linked_wbs_id text,
  primary key (project_id, id),
  foreign key (project_id, linked_wbs_id) references cotizador_temp.elementos_wbs(project_id, id) on delete set null
);

create index on cotizador_temp.rubros_principales (project_id);
create index on cotizador_temp.rubros_secundarios (project_id);
create index on cotizador_temp.rubros_detallados (project_id);
create index on cotizador_temp.tarifas (project_id);
create index on cotizador_temp.elementos_wbs (project_id);
create index on cotizador_temp.elementos_wbs (project_id, parent_id);
create index on cotizador_temp.recursos_wbs (project_id);
create index on cotizador_temp.recursos_wbs (project_id, elemento_wbs_id);
create index on cotizador_temp.milestones (project_id);

create or replace function cotizador_temp.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_projects_updated_at
before update on cotizador_temp.projects
for each row execute function cotizador_temp.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table cotizador_temp.projects enable row level security;

create policy "projects_shared_key_rw"
  on cotizador_temp.projects
  for all
  to anon, authenticated
  using (
    public.cotizador_temp_check_key(
      coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-cotizador-key', '')
    )
  )
  with check (
    public.cotizador_temp_check_key(
      coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-cotizador-key', '')
    )
  );

-- Tablas hijas: RLS habilitado SIN políticas — bloqueadas a acceso directo.
alter table cotizador_temp.narrativa_secciones enable row level security;
alter table cotizador_temp.categorias enable row level security;
alter table cotizador_temp.rubros_principales enable row level security;
alter table cotizador_temp.rubros_secundarios enable row level security;
alter table cotizador_temp.rubros_detallados enable row level security;
alter table cotizador_temp.tarifas enable row level security;
alter table cotizador_temp.elementos_wbs enable row level security;
alter table cotizador_temp.recursos_wbs enable row level security;
alter table cotizador_temp.milestones enable row level security;

grant usage on schema cotizador_temp to anon, authenticated;
grant select, insert, update, delete on cotizador_temp.projects to anon, authenticated;

-- Exponer el schema a PostgREST (equivalente a Settings -> API -> Exposed
-- schemas del dashboard).
alter role authenticator set pgrst.db_schemas = 'public, cotizador_temp';
notify pgrst, 'reload config';

-- ============================================================================
-- save_project / load_project — ver el cuerpo completo y actualizado de
-- ambas funciones directamente en la base de datos (proyecto
-- ffvewifsjksccuksywxx), o las migraciones create_cotizador_temp_save_load_functions
-- / fix_load_project_optional_fields / fix_load_project_invalid_errcode.
-- No se duplica aquí el cuerpo completo para evitar que este archivo quede
-- desincronizado de la fuente de verdad real.
-- ============================================================================

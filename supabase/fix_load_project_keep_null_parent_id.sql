-- Migración: fix_load_project_keep_null_parent_id
--
-- Problema (visto en la prueba real de Vercel con el respaldo de Rumiñahui):
-- `load_project` armaba cada nodo de `elementos_wbs` con
-- `jsonb_strip_nulls(jsonb_build_object(... 'parentId', w.parent_id ...))`.
-- jsonb_strip_nulls elimina TODA clave con valor null, así que los nodos raíz
-- (las Fases, con parent_id null) salían sin `parentId`. El esquema del motor
-- (`wireWbsNodeSchema`: `parentId: z.string().nullable()`) acepta null pero no
-- un campo ausente, y al reabrir un proyecto desde la nube fallaba con:
--   data.elementos_wbs.<id>.parentId: expected string, received undefined
--
-- Arreglo: el resto de campos opcionales sigue pasando por jsonb_strip_nulls
-- (el esquema los trata como opcionales), pero `parentId` se agrega después,
-- fuera del strip, para que un null llegue como `"parentId": null`.
-- Es el único cambio respecto a la versión anterior de la función.

create or replace function cotizador_temp.load_project(p_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_authorized boolean;
  result jsonb;
  oferta jsonb;
begin
  v_authorized := public.cotizador_temp_check_key(
    coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-cotizador-key', '')
  );
  if not v_authorized then
    raise exception 'Clave compartida incorrecta o no configurada.' using errcode = '42501';
  end if;

  select
    jsonb_build_object(
      'version', coalesce(p.version, '14.8'),
      'clientName', coalesce(p.client_name, ''),
      'projectName', coalesce(p.project_name, ''),
      'projectNameFull', coalesce(p.project_name_full, ''),
      'sbu', coalesce(p.sbu, 0),
      'date', coalesce(to_char(p.quote_date, 'YYYY-MM-DD'), ''),
      'quoteType', coalesce(p.quote_type, 'economic'),
      'maxDetailLevel', coalesce(p.max_detail_level, 4),
      'introText', coalesce(p.intro_text, ''),
      'discountType', coalesce(p.discount_type, 'none'),
      'discountValue', coalesce(p.discount_value, 0),
      'quoteSequence', coalesce(p.quote_sequence, ''),
      'targetBudget', coalesce(p.target_budget, 0),
      'globalInsurance', coalesce(p.global_insurance, 0),
      'globalContingency', coalesce(p.global_contingency, 0),
      'globalProfit', coalesce(p.global_profit, 0),
      'milestones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'name', m.name, 'percentage', m.percentage, 'linkedWbsId', coalesce(m.linked_wbs_id, '')
        ) order by m.id)
        from cotizador_temp.milestones m where m.project_id = p.id
      ), '[]'::jsonb)
    )
    ||
    case
      when p.area_total_km2 is not null or p.poblacion_total is not null
        or p.hogares_total is not null or p.edificaciones_total is not null
        or p.notas_territoriales is not null
      then jsonb_build_object('contextoTerritorial', jsonb_strip_nulls(jsonb_build_object(
        'areaTotalKm2', p.area_total_km2, 'poblacionTotal', p.poblacion_total,
        'hogaresTotal', p.hogares_total, 'edificacionesTotal', p.edificaciones_total,
        'notas', p.notas_territoriales
      )))
      else '{}'::jsonb
    end,
    jsonb_build_object(
      'empresa', 'LaOfi S.A.S.',
      'version', coalesce(p.version, '14.8'),
      'timestamp', to_char(p.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  into oferta, result
  from cotizador_temp.projects p
  where p.id = p_id;

  if result is null then
    raise exception 'Proyecto no encontrado.';
  end if;

  result := result || jsonb_build_object('data', jsonb_build_object(
    'version', oferta->>'version',
    'categorias', coalesce((
      select jsonb_object_agg(c.id, jsonb_build_object('id', c.id, 'name', c.name))
      from cotizador_temp.categorias c where c.project_id = p_id
    ), '{}'::jsonb),
    'rubros_principales', coalesce((
      select jsonb_object_agg(r.id, jsonb_build_object('id', r.id, 'parentId', r.parent_id, 'name', r.name))
      from cotizador_temp.rubros_principales r where r.project_id = p_id
    ), '{}'::jsonb),
    'rubros_secundarios', coalesce((
      select jsonb_object_agg(r.id, jsonb_build_object('id', r.id, 'parentId', r.parent_id, 'name', r.name))
      from cotizador_temp.rubros_secundarios r where r.project_id = p_id
    ), '{}'::jsonb),
    'rubros_detallados', coalesce((
      select jsonb_object_agg(r.id, jsonb_strip_nulls(jsonb_build_object(
        'id', r.id, 'parentId', r.parent_id, 'name', r.name, 'description', r.description
      )))
      from cotizador_temp.rubros_detallados r where r.project_id = p_id
    ), '{}'::jsonb),
    'tarifas', coalesce((
      select jsonb_object_agg(tf.id, jsonb_build_object(
        'id', tf.id, 'parentId', tf.parent_id, 'supplier', coalesce(tf.supplier, ''),
        'unitCost', tf.unit_cost, 'unit', tf.unit
      ))
      from cotizador_temp.tarifas tf where tf.project_id = p_id
    ), '{}'::jsonb),
    'elementos_wbs', coalesce((
      select jsonb_object_agg(w.id, jsonb_strip_nulls(jsonb_build_object(
        'id', w.id, 'code', w.code, 'name', w.name, 'levelType', w.level_type,
        'isActive', w.is_active, 'desc_general', w.desc_general, 'desc_smart', w.desc_smart,
        'desc_kpi', w.desc_kpi, 'desc_aporte', w.desc_aporte, 'desc_insumos', w.desc_insumos,
        'desc_tecnica', w.desc_tecnica, 'deliverable', w.deliverable, 'startDay', w.start_day, 'duration', w.duration
      )) || jsonb_build_object('parentId', w.parent_id))
      from cotizador_temp.elementos_wbs w where w.project_id = p_id
    ), '{}'::jsonb),
    'recursos_wbs', coalesce((
      select jsonb_object_agg(r.id, jsonb_strip_nulls(jsonb_build_object(
        'id', r.id, 'elemento_wbs_id', r.elemento_wbs_id, 'tarifa_id', r.tarifa_id,
        'quantity', r.quantity, 'quantityUnit', r.quantity_unit, 'time', r.time, 'timeUnit', r.time_unit,
        'isProrated', r.is_prorated, 'isLocked', r.is_locked,
        'excluded_ids', to_jsonb(r.excluded_ids), 'observations', r.observations
      )))
      from cotizador_temp.recursos_wbs r where r.project_id = p_id
    ), '{}'::jsonb),
    'oferta_comercial', oferta,
    'narrativa', coalesce((
      select jsonb_object_agg(n.section_id, jsonb_build_object('texto', n.texto))
      from cotizador_temp.narrativa_secciones n where n.project_id = p_id
    ), '{}'::jsonb)
  ));

  return result;
end;
$function$;

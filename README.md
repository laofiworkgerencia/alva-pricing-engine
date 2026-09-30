# ALVA Pricing Engine

Reescritura del **núcleo** de [Cotizador ALVA v3](https://github.com/laofiworkgerencia/cotizador-alva-v3):
el `PricingEngine`, el `AutoQuoterEngine`, el modelo de datos jerárquico N1–N5/WBS
y el parser de importación/exportación, con TypeScript, tests automatizados
(Vitest) y validación de datos (Zod). **No reemplaza la app original** —
es una base alternativa, más fácil de mantener y verificar. Ya cubre las
**8 pestañas** de la UI original, pero con gaps reales frente a ella que se
documentan explícitamente más abajo (no es un reemplazo 1:1 todavía).

## Qué incluye esta primera versión

- **`src/engine/`** — el motor, sin dependencias de UI:
  - `types.ts` — modelo de datos (Categoría → Rubro Principal → Rubro
    Secundario → Rubro Detallado → Tarifa, nodos WBS, asignaciones, oferta
    comercial).
  - `timeUnits.ts` — conversión de unidades de tiempo (Hora/Día/Semana/Mes → días).
  - `pricingEngine.ts` — cálculo de costo por asignación, distribución
    directa vs. prorrateada (por duración o por costo), rollup de
    cronograma en nodos padre, y resumen financiero A.I.U. (Seguros +
    Imprevistos + Utilidad − Descuento).
  - `autoQuoterEngine.ts` — sugerencia automática de recursos por keywords
    en las descripciones del WBS (con coincidencia por límite de palabra,
    a diferencia del `includes` plano original — ver más abajo).
  - `wbsMarkdownParser.ts` — parser del formato Markdown de importación de WBS.
  - `wireSchema.ts` / `projectIO.ts` — validación (Zod) e import/export en
    el mismo formato JSON `"empresa": "LaOfi S.A.S."` que usa la app original,
    para que los proyectos sean intercambiables entre ambas.
  - `catalogOps.ts` — operaciones CRUD del catálogo y de las asignaciones
    (crear/editar/eliminar N3/N4/N5 y `recursos_wbs`), con borrado en
    cascada (eliminar un N3 elimina sus N4, N5 y las asignaciones que los
    usan) como funciones puras e inmutables.
  - `pricingEngine.ts` también devuelve `contributions`: una traza de
    auditoría por asignación (a qué hoja aportó, cuánto, si fue costo
    directo o prorrateado, y con qué criterio de reparto) — no existía en
    el original, donde el desglose por hoja no era inspeccionable.
- **`src/App.tsx`** — las 8 pestañas de la app original, más persistencia
  local (`localStorage`): el proyecto ya no se pierde al recargar la
  pestaña del navegador (antes solo existía en memoria — ver "Qué falta").
  - **WBS y Financiero**: cargar un proyecto de ejemplo o importar un
    `.json` real exportado desde el Cotizador ALVA v3, ver el árbol WBS con
    costos calculados y el resumen financiero, y exportarlo de vuelta.
  - **Recursos** (`src/RecursosView.tsx`): gestión completa del catálogo
    N1–N5 (crear/renombrar/eliminar Rubros Secundarios, Detallados y
    Tarifas) y de las asignaciones de recursos a nodos WBS — antes solo se
    podía editar el proyecto a mano en el JSON.
  - **Costos Prorrateados** (`src/ProratedCostsView.tsx`): por cada tarea
    (hoja del WBS), costo directo vs. prorrateado, y al hacer click, el
    detalle de qué asignación aportó cada monto, desde qué nodo se
    prorrateó, y con qué criterio (duración, costo directo o partes
    iguales) — la auditoría que el original no exponía.
  - **Gantt Valorado** (`src/GanttValoradoView.tsx` + `engine/valorizedSchedule.ts`):
    barras de Gantt por nodo WBS según `startDay`/`duration` (con zoom
    Día/Semana/Mes, reutilizando la misma tabla de conversión temporal del
    motor), y debajo un Cronograma Valorado: el costo de cada nodo
    distribuido uniformemente entre sus días de ejecución y agrupado por
    período, con fila de Total y de Acumulado — horizonte por defecto de
    210 días (7 meses), documentado en `SKILL.md`.
  - **Propuesta Comercial** (`src/PropuestaComercialView.tsx` +
    `engine/ofertaOps.ts`): datos del cliente/proyecto, parámetros
    financieros (Seguros/Imprevistos/Utilidad/Descuento) con el resumen
    recalculándose en vivo, semáforo de presupuesto (verde/amarillo/rojo
    comparando el PVP contra `targetBudget`), y gestión de hitos de
    facturación (agregar/editar/eliminar, vinculados a un nodo WBS, con
    aviso si los porcentajes no suman 100%).
  - **Propuesta Narrativa** (`src/PropuestaNarrativaView.tsx` +
    `engine/narrativePrompt.ts` + `api/generate-narrative.ts`): redacción
    asistida por IA de las 2 secciones narrativas (Alerta Normativa, La
    Solución). El texto ahora se guarda **dentro** del proyecto (`narrativa`
    en el JSON exportado) — en el original vivía en `dbState.propuesta`,
    fuera del archivo portable, y se perdía al exportar/importar. Ver
    "Despliegue" abajo para cómo funciona la IA sin exponer ninguna key.
  - **Asistente ALVA** (`src/AsistenteAlvaView.tsx` + `engine/chatPrompt.ts`
    + `engine/aiCommands.ts` + `api/chat.ts`): chat que puede modificar el
    proyecto por instrucción del usuario ("agrega un topógrafo a la Fase 2",
    "sube el costo del especialista SIG a 2000", "crea la tarea 1.3..."). El
    modelo responde con un bloque JSON oculto de comandos
    (`ADD_RESOURCE`/`UPDATE_RESOURCE`/`ADD_WBS`/`UPDATE_WBS`/`DELETE_WBS`)
    que `aiCommands.ts` valida y aplica — a diferencia del original, que
    confiaba ciegamente en el JSON del LLM y mutaba el estado con
    `JSON.parse(JSON.stringify(dbState))`, cada comando aquí se valida
    contra el proyecto real (un `wbs_id`/`tarifa_id` inexistente se
    reporta como advertencia y se omite, nunca corrompe el estado) y
    `DELETE_WBS` borra en cascada sus descendientes y asignaciones (el
    original solo borraba el nodo, dejando hijos huérfanos). `api/chat.ts`
    es un relay "tonto": el prompt de sistema y el parseo de comandos
    viven en el motor (se ejecutan en el cliente), el servidor solo agrega
    la API key y reenvía a Gemini.
  - **Propuesta Clásica** (`src/PropuestaClasicaView.tsx` +
    `engine/classicProposal.ts` + `engine/classicDocxExport.ts`): la 8va
    pestaña, equivalente a `renderClassicQuotePreview()` +
    `generateWordDoc('classic')` del original — preview del documento
    formal (header, contexto territorial, narrativa, desglose de costos
    por WBS con entregables, cronograma, total, plan de hitos) y un botón
    que exporta un **`.docx` real** (librería `docx`, cargada solo al
    exportar para no engordar el bundle principal). El original generaba
    un `.doc` falso: un blob HTML con MIME `application/msword` que Word
    abre pero no es OOXML genuino. El "Contexto Territorial" aquí es
    libre para cualquier proyecto (campos numéricos + notas); en el
    original era una tabla censal del cantón Archidona (INEC CPV 2022)
    hardcodeada en el código y mostrada solo si `clientName` contenía la
    palabra "archidona".
- **96 tests** cubriendo los dos ejemplos numéricos documentados en
  `SKILL.md` (Especialista SIG → $3,750; Relevador → $64,800), un caso
  completo de prorrateo mixto (por costo directo y por duración) con su
  traza de auditoría, la distribución temporal del cronograma valorado,
  el round-trip de import/export (incluyendo `narrativa`), el parser de
  Markdown, el borrado en cascada del catálogo y del WBS, la edición de
  la oferta comercial/hitos, los endpoints `/api/generate-narrative` y
  `/api/chat` (mockeando la llamada a Gemini en ambos), y la generación
  del `.docx` de la Propuesta Clásica (valida que el buffer resultante
  sea un zip OOXML no vacío).

## Diferencias deliberadas frente al original

Mejoras aplicadas durante la reescritura (ver diagnóstico original en la
conversación que dio origen a este repo):

1. **Sin secretos en el cliente.** El original horneaba una API key de
   Gemini (`VITE_GEMINI_API_KEY`) en el bundle de producción, extraíble por
   cualquier usuario. Aquí toda llamada a Gemini pasa por un endpoint
   propio (`api/generate-narrative.ts`, `api/chat.ts`; funciones serverless
   de Vercel) que guarda la key como variable de entorno del servidor — el
   navegador nunca la ve.
2. **Motor modular y testeado**, en vez de un solo archivo de 5,600+ líneas
   mezclando cálculo financiero, estado de UI y las 8 pestañas.
3. **Coincidencia de keywords por límite de palabra** en `AutoQuoterEngine`
   (el `includes` plano original produce falsos positivos, ej. la palabra
   "relevante" activa por error la keyword "vant").
4. **Validación de esquema (Zod)** en la importación de proyectos, con
   errores legibles, en vez de una verificación ad-hoc de dos campos.
5. **Nomenclatura A.I.U. correcta.** El campo se llama A.I.U. (Administración,
   Imprevistos y Utilidad) en la literatura de contratación, pero el cálculo
   real (`globalInsurance` + `globalContingency` + `globalProfit`) es
   Seguros + Imprevistos + Utilidad. Aquí se documenta explícitamente esa
   discrepancia en vez de dejarla implícita.
6. **Export a Word genuino.** La Propuesta Clásica exporta un `.docx` real
   (OOXML, vía la librería `docx`), no el truco HTML→blob `application/msword`
   del original.
7. **Persistencia local.** `localStorage` evita perder el proyecto al
   recargar el navegador — el original tampoco tenía esto para la sesión
   de trabajo en curso salvo que sincronizara a Supabase (parcial e
   inconsistente, según auditoría previa).

## Gaps reales frente al original (pendientes, no descubiertos por error)

- **Guardado en la nube sin login (temporal).** `src/cloudStore.ts` +
  `src/CloudPanel.tsx` guardan/listan/abren proyectos en una tabla de
  Supabase (`cotizador_temp_projects`, en el proyecto `alva-ingenieria`
  de la organización ALVA FINANZAS). Es **explícitamente temporal**:
  guarda el proyecto completo como JSON (sin modelo relacional), y la
  tabla tiene el prefijo `cotizador_temp_` para no mezclarse con las
  tablas reales de ALVA Finanzas. No hay login real todavía — en su
  lugar, el acceso está protegido por una **clave compartida** (una
  sola, no por usuario) que el frontend envía en el header
  `x-cotizador-key` y que una política RLS valida contra un hash
  (bcrypt vía `pgcrypto`) guardado en `cotizador_temp_config` (tabla sin
  ninguna política RLS — inaccesible por la API pública, solo la lee la
  función `SECURITY DEFINER` `cotizador_temp_check_key`). Ver migraciones
  `create_cotizador_temp_projects`,
  `fix_cotizador_temp_set_updated_at_search_path` y
  `add_cotizador_temp_shared_key`. Verificado con SQL directo como rol
  `anon` (clave correcta → acceso; incorrecta/ausente → 0 filas) y con
  Playwright interceptando las llamadas de red (sin clave el botón de
  guardar queda deshabilitado; clave incorrecta se rechaza con mensaje
  claro; clave correcta habilita guardar/listar/abrir). Se migrará al
  esquema unificado de ALVA (con auth real y RLS por usuario/workspace)
  cuando esté diseñado; mientras tanto no subas aquí cotizaciones con
  información realmente confidencial — es una traba deliberadamente
  simple, no una autenticación real.
- El Asistente ALVA de esta versión es una sola conversación (sin el
  sidebar de sesiones múltiples del original) y solo texto — sin adjuntar
  imágenes/Excel/Word/PDF todavía (el original los soporta vía `xlsx`,
  `mammoth` y `pdfjs-dist`, que no se agregaron en esta primera pasada).
  El historial del chat no se guarda con el proyecto (es de memoria, se
  pierde al recargar).
- `isLocked` (bloqueo de asignaciones ante reestructuración top-down de
  fechas) — es una conducta de edición interactiva, no parte del cálculo
  puro; se evaluará junto con la UI de edición.
- El logo corporativo de la Propuesta Clásica es solo estado de sesión
  (igual que en el original): no viaja en el JSON exportado ni sobrevive
  a un recargo de página.

## Desarrollo

```bash
npm install
npm test        # vitest run — 96 tests
npm run build   # tsc -b && vite build
npm run dev     # servidor de desarrollo (sin /api — ver nota abajo)
```

> `npm run dev` solo levanta el frontend con Vite; `/api/*` no existe en ese
> servidor. Sin backend, el botón "✨ Generar con IA" de Propuesta Narrativa
> muestra automáticamente el prompt para copiar/pegar manualmente (mismo
> respaldo que tenía el original sin API key), y el Asistente ALVA muestra
> un mensaje de error en el chat. Para probar los endpoints reales en local
> hace falta la CLI de Vercel (`vercel dev`).

## Despliegue (Vercel + backend de IA)

El frontend y el endpoint de IA se despliegan juntos como un solo proyecto
de Vercel (Vercel detecta `api/*.ts` como funciones serverless
automáticamente, sin configuración extra). Pasos, una sola vez:

1. Entra a [vercel.com](https://vercel.com), inicia sesión con tu cuenta de
   GitHub y click **Add New… → Project**.
2. Importa el repositorio `laofiworkgerencia/alva-pricing-engine`.
3. En **Environment Variables**, agrega:
   - `GEMINI_API_KEY` = tu API key real de Gemini (consíguela en
     [aistudio.google.com/apikey](https://aistudio.google.com/apikey)).
     Este valor se queda en el dashboard de Vercel — nunca lo pegues en el
     código ni me lo compartas a mí.
4. Click **Deploy**. Vercel construye con `npm run build` (detectado
   automáticamente por ser un proyecto Vite) y publica `/api/generate-narrative`
   y `/api/chat` como funciones serverless en el mismo dominio.
5. Listo — "Propuesta Narrativa" y "Asistente ALVA" ya generan/actúan con
   IA real. Cualquier redeploy futuro (push a `main`) es automático.

### Guardado en la nube (temporal)

Para que el botón "☁ Guardar en la nube" funcione en producción, agrega
estas dos variables también en **Environment Variables** de Vercel (son
públicas por diseño — a diferencia de `GEMINI_API_KEY`, sí pueden ir en
el cliente; no hace falta mantenerlas en secreto):

- `VITE_SUPABASE_URL` = `https://ffvewifsjksccuksywxx.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `sb_publishable_FWW4HbVWeRoA08s3LM2DLw_AUyk6dza`

Sin estas variables, la app funciona igual pero el panel de nube
simplemente no aparece (`cloudEnabled` queda en `false`); no es un
requisito para probar el resto de las pestañas.

Además, dentro de la app (pestaña "☁ Proyectos en la nube"), hay que
escribir una vez la **clave compartida** y hacer click en "Guardar
clave" — se valida contra la base y queda guardada en `localStorage` de
ese navegador. Sin la clave correcta, el botón de guardar queda
deshabilitado y la lista aparece vacía (la política RLS filtra todo).
Esa clave no es un secreto de Vercel — es algo que se escribe dentro de
la app misma, la primera vez que se usa en cada navegador/dispositivo.

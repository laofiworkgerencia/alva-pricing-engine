# ALVA Pricing Engine

Reescritura del **núcleo** de [Cotizador ALVA v3](https://github.com/laofiworkgerencia/cotizador-alva-v3):
el `PricingEngine`, el `AutoQuoterEngine`, el modelo de datos jerárquico N1–N5/WBS
y el parser de importación/exportación, con TypeScript, tests automatizados
(Vitest) y validación de datos (Zod). **No reemplaza la app original** —
es una base alternativa, más fácil de mantener y verificar, pensada para
validar primero el motor antes de invertir en reconstruir las 8 pestañas
completas de la UI original.

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
- **`src/App.tsx`** — UI mínima con tres pestañas:
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
- **60 tests** cubriendo los dos ejemplos numéricos documentados en
  `SKILL.md` (Especialista SIG → $3,750; Relevador → $64,800), un caso
  completo de prorrateo mixto (por costo directo y por duración) con su
  traza de auditoría, la distribución temporal del cronograma valorado,
  el round-trip de import/export (incluyendo `narrativa`), el parser de
  Markdown, el borrado en cascada del catálogo, la edición de la oferta
  comercial/hitos, y el endpoint `/api/generate-narrative` (mockeando la
  llamada a Gemini).

## Diferencias deliberadas frente al original

Mejoras aplicadas durante la reescritura (ver diagnóstico original en la
conversación que dio origen a este repo):

1. **Sin secretos en el cliente.** El original horneaba una API key de
   Gemini (`VITE_GEMINI_API_KEY`) en el bundle de producción, extraíble por
   cualquier usuario. Aquí la generación de texto pasa por un endpoint
   propio (`api/generate-narrative.ts`, función serverless de Vercel) que
   guarda la key como variable de entorno del servidor — el navegador
   nunca la ve, solo llama a `/api/generate-narrative`.
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

## Qué falta a propósito (no es una regresión, es alcance de esta primera entrega)

- El resto de las pestañas de la UI original (Propuesta clásica/Word,
  Asistente ALVA, Copiloto IA) — se construyen incrementalmente sobre
  este mismo motor. El Asistente/Copiloto (chat multi-turno) reutilizará
  el mismo patrón de `api/generate-narrative.ts`.
- Generación de documento/Word de la propuesta — esta pantalla solo
  gestiona los datos de la oferta comercial, no exporta un `.docx`.
- Editor de "Contexto Territorial" — el prompt de la IA acepta datos
  territoriales (`areaTotalKm2`, `edificacionesTotal`) pero esta versión
  no tiene todavía la pantalla para capturarlos; por ahora solo usa
  cliente/nombre del proyecto.
- Autenticación/persistencia multi-usuario (Supabase) — esta versión es
  local, sin backend.
- `isLocked` (bloqueo de asignaciones ante reestructuración top-down de
  fechas) — es una conducta de edición interactiva, no parte del cálculo
  puro; se evaluará junto con la UI de edición.

## Desarrollo

```bash
npm install
npm test        # vitest run — 60 tests
npm run build   # tsc -b && vite build
npm run dev     # servidor de desarrollo (sin /api — ver nota abajo)
```

> `npm run dev` solo levanta el frontend con Vite; `/api/generate-narrative`
> no existe en ese servidor. Sin él, el botón "✨ Generar con IA" falla y
> muestra automáticamente el prompt para copiar/pegar manualmente (mismo
> comportamiento de respaldo que tenía el original sin API key). Para
> probar el endpoint real en local hace falta la CLI de Vercel (`vercel dev`).

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
   como función serverless en el mismo dominio.
5. Listo — la pestaña "Propuesta Narrativa" del sitio desplegado ya genera
   texto con IA. Cualquier redeploy futuro (push a `main`) es automático.

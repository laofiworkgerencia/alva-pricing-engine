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
- **40 tests** cubriendo los dos ejemplos numéricos documentados en
  `SKILL.md` (Especialista SIG → $3,750; Relevador → $64,800), un caso
  completo de prorrateo mixto (por costo directo y por duración) con su
  traza de auditoría, el round-trip de import/export, el parser de
  Markdown, y el borrado en cascada del catálogo.

## Diferencias deliberadas frente al original

Mejoras aplicadas durante la reescritura (ver diagnóstico original en la
conversación que dio origen a este repo):

1. **Sin secretos en el cliente.** El original horneaba una API key de
   Gemini (`VITE_GEMINI_API_KEY`) en el bundle de producción, extraíble por
   cualquier usuario. Esta versión no incluye llamadas a LLMs; si se agregan,
   la key debe ser provista por cada usuario (como ya hacía el `CopilotTab`
   original), nunca compilada en el build.
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

- El resto de las pestañas de la UI original (Gantt valorado, Propuesta
  narrativa, Propuesta clásica/Word, Asistente ALVA, Copiloto IA) — se
  construyen incrementalmente sobre este mismo motor.
- Autenticación/persistencia multi-usuario (Supabase) — esta versión es
  local, sin backend.
- `isLocked` (bloqueo de asignaciones ante reestructuración top-down de
  fechas) — es una conducta de edición interactiva, no parte del cálculo
  puro; se evaluará junto con la UI de edición.

## Desarrollo

```bash
npm install
npm test        # vitest run — 40 tests
npm run build   # tsc -b && vite build
npm run dev     # servidor de desarrollo
```

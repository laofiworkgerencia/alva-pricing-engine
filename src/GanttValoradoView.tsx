import { useMemo, useState } from 'react';
import {
  buildValorizedSchedule,
  buildWbsTree,
  type GanttZoom,
  type PricingResult,
  type ProjectData,
  type WbsTreeNode,
} from './engine';
import { formatUSD } from './format';

/** Horizonte mínimo por defecto: 210 días / 7 meses, documentado en SKILL.md. */
const HORIZON_DAYS_DEFAULT = 210;
const ZOOM_OPTIONS: GanttZoom[] = ['Día', 'Semana', 'Mes'];

interface FlatNode {
  node: WbsTreeNode;
  depth: number;
}

function flatten(nodes: WbsTreeNode[], depth = 0): FlatNode[] {
  return nodes.flatMap((n) => [{ node: n, depth }, ...flatten(n.children, depth + 1)]);
}

export default function GanttValoradoView({
  project,
  result,
}: {
  project: ProjectData;
  result: PricingResult;
}) {
  const [zoom, setZoom] = useState<GanttZoom>('Mes');

  const roots = useMemo(() => buildWbsTree(project.elementosWbs), [project.elementosWbs]);
  const flat = useMemo(() => flatten(roots), [roots]);

  const valorized = useMemo(
    () => buildValorizedSchedule(roots, result.costByNode, result.scheduleByNode, zoom, HORIZON_DAYS_DEFAULT),
    [roots, result.costByNode, result.scheduleByNode, zoom]
  );

  const horizonDays = valorized.periods[valorized.periods.length - 1]?.endDay ?? 1;

  const cumulative = useMemo(
    () =>
      valorized.totalsByPeriod.reduce<number[]>((acc, v) => {
        const previous = acc.length > 0 ? acc[acc.length - 1] : 0;
        return [...acc, previous + v];
      }, []),
    [valorized.totalsByPeriod]
  );

  const zoomUnitPlural = zoom === 'Mes' ? 'meses' : zoom === 'Semana' ? 'semanas' : 'días';

  return (
    <div className="gantt">
      <section className="panel">
        <div className="gantt-header">
          <h2>Gantt Valorado</h2>
          <div className="zoom-toggle">
            {ZOOM_OPTIONS.map((z) => (
              <button
                key={z}
                type="button"
                className={zoom === z ? 'active' : ''}
                onClick={() => setZoom(z)}
              >
                {z}
              </button>
            ))}
          </div>
        </div>
        <p className="hint">
          Horizonte: {horizonDays} días ({valorized.periods.length} {zoomUnitPlural}).
        </p>

        <div className="gantt-chart">
          {flat.map(({ node, depth }) => {
            const schedule = result.scheduleByNode[node.id] ?? {
              startDay: node.startDay,
              duration: node.duration,
            };
            const duration = Math.max(schedule.duration, 1);
            const leftPct = ((schedule.startDay - 1) / horizonDays) * 100;
            const widthPct = Math.max((duration / horizonDays) * 100, 0.5);
            const cost = result.costByNode[node.id]?.total ?? 0;
            return (
              <div key={node.id} className="gantt-row">
                <div className="gantt-label" style={{ paddingLeft: depth * 16 }}>
                  <span className="wbs-code">{node.code}</span> {node.name}
                </div>
                <div className="gantt-track">
                  <div
                    className={`gantt-bar bar-${node.levelType}`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    title={`${node.code} · días ${schedule.startDay}–${schedule.startDay + duration - 1} · ${formatUSD(cost)}`}
                  />
                </div>
              </div>
            );
          })}
          {flat.length === 0 && <p className="hint">Este proyecto no tiene nodos en el WBS.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>Cronograma Valorado</h2>
        <p className="hint">
          Costo de cada nodo distribuido uniformemente entre sus días de ejecución y
          agrupado por {zoom.toLowerCase()}.
        </p>
        <div className="valorized-scroll">
          <table className="valorized-table">
            <thead>
              <tr>
                <th className="sticky-col">Nodo</th>
                {valorized.periods.map((p) => (
                  <th key={p.index}>{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flat.map(({ node, depth }) => (
                <tr key={node.id}>
                  <td className="sticky-col" style={{ paddingLeft: depth * 16 }}>
                    {node.code} {node.name}
                  </td>
                  {(valorized.amountsByNode[node.id] ?? []).map((v, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <td key={i} className="amount-cell">
                      {v > 0 ? formatUSD(v) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td className="sticky-col">Total</td>
                {valorized.totalsByPeriod.map((v, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <td key={i} className="amount-cell">
                    {formatUSD(v)}
                  </td>
                ))}
              </tr>
              <tr className="cumulative-row">
                <td className="sticky-col">Acumulado</td>
                {cumulative.map((v, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <td key={i} className="amount-cell">
                    {formatUSD(v)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

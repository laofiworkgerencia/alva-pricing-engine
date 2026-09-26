import { useMemo, useState } from 'react';
import { buildWbsTree, type PricingResult, type ProjectData, type WbsTreeNode } from './engine';
import { formatUSD } from './format';

function collectLeaves(nodes: WbsTreeNode[]): WbsTreeNode[] {
  return nodes.flatMap((n) => (n.children.length === 0 ? [n] : collectLeaves(n.children)));
}

function basisLabel(basis: 'duration' | 'directCost' | 'equal' | undefined): string {
  switch (basis) {
    case 'duration':
      return 'Duración';
    case 'directCost':
      return 'Costo directo';
    case 'equal':
      return 'Partes iguales';
    default:
      return '—';
  }
}

export default function ProratedCostsView({
  project,
  result,
}: {
  project: ProjectData;
  result: PricingResult;
}) {
  const leaves = useMemo(() => collectLeaves(buildWbsTree(project.elementosWbs)), [project.elementosWbs]);
  const [selectedLeafId, setSelectedLeafId] = useState<string | null>(null);

  const selected = selectedLeafId ? leaves.find((l) => l.id === selectedLeafId) ?? null : null;
  const selectedContributions = useMemo(
    () => (selectedLeafId ? result.contributions.filter((c) => c.leafId === selectedLeafId) : []),
    [result.contributions, selectedLeafId]
  );

  const resolveResource = (tarifaId: string) => {
    const tarifa = project.tarifas[tarifaId];
    const n4 = tarifa ? project.rubrosDetallados[tarifa.parentId] : undefined;
    return { name: n4?.name ?? '(recurso eliminado)', supplier: tarifa?.supplier ?? '—' };
  };

  return (
    <div className="prorated">
      <section className="panel">
        <h2>Costos Prorrateados por Tarea</h2>
        <p className="hint">
          Costo directo vs. costo recibido por prorrateo, hoja por hoja. Haz click en
          una fila para ver qué asignación aportó cada monto y con qué criterio.
        </p>
        <table className="prorated-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Tarea</th>
              <th>Directo</th>
              <th>Prorrateado</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((leaf) => {
              const cost = result.costByNode[leaf.id];
              return (
                <tr
                  key={leaf.id}
                  className={leaf.id === selectedLeafId ? 'selected' : ''}
                  onClick={() => setSelectedLeafId(leaf.id)}
                >
                  <td>{leaf.code}</td>
                  <td>{leaf.name}</td>
                  <td>{formatUSD(cost?.direct ?? 0)}</td>
                  <td>{formatUSD(cost?.shared ?? 0)}</td>
                  <td className="total-cell">{formatUSD(cost?.total ?? 0)}</td>
                </tr>
              );
            })}
            {leaves.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">Este proyecto no tiene tareas (hojas) en el WBS.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Detalle{selected ? ` — ${selected.code} · ${selected.name}` : ''}</h2>
        {!selected && (
          <p className="hint">Selecciona una tarea de la tabla para ver el detalle de su costo.</p>
        )}
        {selected && selectedContributions.length === 0 && (
          <p className="hint">Esta tarea no tiene ningún costo asignado (directo ni prorrateado).</p>
        )}
        {selected && selectedContributions.length > 0 && (
          <table className="contrib-table">
            <thead>
              <tr>
                <th>Recurso</th>
                <th>Proveedor</th>
                <th>Asignado en</th>
                <th>Tipo</th>
                <th>Criterio</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {selectedContributions.map((c, i) => {
                const { name, supplier } = resolveResource(c.tarifaId);
                const sourceNode = project.elementosWbs[c.sourceNodeId];
                return (
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={`${c.assignmentId}-${i}`}>
                    <td>{name}</td>
                    <td>{supplier}</td>
                    <td>{sourceNode ? `${sourceNode.code} · ${sourceNode.name}` : '(nodo eliminado)'}</td>
                    <td>
                      <span className={`badge badge-${c.kind}`}>
                        {c.kind === 'direct' ? 'Directo' : 'Prorrateado'}
                      </span>
                    </td>
                    <td>{c.kind === 'shared' ? basisLabel(c.basis) : '—'}</td>
                    <td className="cost-cell">{formatUSD(c.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

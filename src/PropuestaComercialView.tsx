import { useMemo } from 'react';
import {
  addMilestone,
  buildWbsTree,
  removeMilestone,
  updateMilestone,
  updateOfertaComercial,
  type DiscountType,
  type PricingResult,
  type ProjectData,
  type WbsTreeNode,
} from './engine';
import { formatUSD } from './format';
import NumberField from './NumberField';

const DISCOUNT_LABELS: Record<DiscountType, string> = {
  none: 'Sin descuento',
  percentage: 'Porcentaje (%)',
  value: 'Monto fijo ($)',
};

function flattenWbs(nodes: WbsTreeNode[], depth = 0): Array<{ id: string; code: string; name: string; depth: number }> {
  return nodes.flatMap((n) => [
    { id: n.id, code: n.code, name: n.name, depth },
    ...flattenWbs(n.children, depth + 1),
  ]);
}

export default function PropuestaComercialView({
  project,
  result,
  onChange,
}: {
  project: ProjectData;
  result: PricingResult;
  onChange: (next: ProjectData) => void;
}) {
  const oferta = project.ofertaComercial;

  const wbsFlat = useMemo(() => flattenWbs(buildWbsTree(project.elementosWbs)), [project.elementosWbs]);

  const milestonePercentSum = oferta.milestones.reduce((acc, m) => acc + m.percentage, 0);
  const milestonesBalanced = oferta.milestones.length === 0 || Math.abs(milestonePercentSum - 100) < 0.01;

  const semaforo = useMemo(() => {
    if (!oferta.targetBudget || oferta.targetBudget <= 0) return null;
    const ratio = result.summary.total / oferta.targetBudget;
    if (ratio <= 1) return { level: 'green' as const, label: 'Dentro del presupuesto referencial' };
    if (ratio <= 1.1) return { level: 'yellow' as const, label: 'Hasta 10% sobre el presupuesto referencial' };
    return { level: 'red' as const, label: 'Más de 10% sobre el presupuesto referencial' };
  }, [oferta.targetBudget, result.summary.total]);

  const patch = (p: Partial<typeof oferta>) => onChange(updateOfertaComercial(project, p));

  return (
    <div className="propuesta">
      <section className="panel">
        <h2>Datos del Cliente y Proyecto</h2>
        <div className="form-grid">
          <label>
            Cliente
            <input value={oferta.clientName} onChange={(e) => patch({ clientName: e.target.value })} />
          </label>
          <label>
            Secuencia de cotización
            <input value={oferta.quoteSequence} onChange={(e) => patch({ quoteSequence: e.target.value })} />
          </label>
          <label>
            Nombre del proyecto (corto)
            <input value={oferta.projectName} onChange={(e) => patch({ projectName: e.target.value })} />
          </label>
          <label>
            Fecha
            <input type="date" value={oferta.date} onChange={(e) => patch({ date: e.target.value })} />
          </label>
          <label className="full-width">
            Nombre completo del proyecto
            <input
              value={oferta.projectNameFull}
              onChange={(e) => patch({ projectNameFull: e.target.value })}
            />
          </label>
          <label className="full-width">
            Texto introductorio de la propuesta
            <textarea
              rows={3}
              value={oferta.introText}
              onChange={(e) => patch({ introText: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Parámetros Financieros (A.I.U.)</h2>
        <p className="hint">
          A.I.U. = Administración, Imprevistos y Utilidad. Este motor calcula Seguros +
          Imprevistos + Utilidad sobre el costo base; documentamos la diferencia con el
          término estándar en el README.
        </p>
        <div className="form-grid">
          <label>
            Seguros (%)
            <NumberField value={oferta.globalInsurance} onCommit={(n) => patch({ globalInsurance: n })} />
          </label>
          <label>
            Imprevistos (%)
            <NumberField value={oferta.globalContingency} onCommit={(n) => patch({ globalContingency: n })} />
          </label>
          <label>
            Utilidad (%)
            <NumberField value={oferta.globalProfit} onCommit={(n) => patch({ globalProfit: n })} />
          </label>
          <label>
            Tipo de descuento
            <select
              value={oferta.discountType}
              onChange={(e) => patch({ discountType: e.target.value as DiscountType })}
            >
              {(Object.keys(DISCOUNT_LABELS) as DiscountType[]).map((t) => (
                <option key={t} value={t}>{DISCOUNT_LABELS[t]}</option>
              ))}
            </select>
          </label>
          {oferta.discountType !== 'none' && (
            <label>
              Valor del descuento {oferta.discountType === 'percentage' ? '(%)' : '($)'}
              <NumberField value={oferta.discountValue} onCommit={(n) => patch({ discountValue: n })} />
            </label>
          )}
          <label>
            Presupuesto referencial del cliente ($)
            <NumberField value={oferta.targetBudget} onCommit={(n) => patch({ targetBudget: n })} />
          </label>
        </div>

        <table className="summary-preview">
          <tbody>
            <tr><td>Costo Base</td><td>{formatUSD(result.summary.costBase)}</td></tr>
            <tr><td>Seguros</td><td>{formatUSD(result.summary.insurance)}</td></tr>
            <tr><td>Imprevistos</td><td>{formatUSD(result.summary.contingency)}</td></tr>
            <tr><td>Utilidad</td><td>{formatUSD(result.summary.profit)}</td></tr>
            <tr><td>Descuento</td><td>-{formatUSD(result.summary.discount)}</td></tr>
            <tr className="total"><td>TOTAL (PVP)</td><td>{formatUSD(result.summary.total)}</td></tr>
          </tbody>
        </table>

        {semaforo && (
          <div className={`semaforo semaforo-${semaforo.level}`}>
            <span className="semaforo-dot" />
            {semaforo.label} (presupuesto: {formatUSD(oferta.targetBudget)})
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Hitos de Facturación</h2>
        <p className="hint">
          Los porcentajes deben sumar 100%.{' '}
          {!milestonesBalanced && (
            <strong className="warn-text">Suman {milestonePercentSum}% — revisa los hitos.</strong>
          )}
        </p>
        <table className="milestones-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>%</th>
              <th>Vinculado a</th>
              <th>Monto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {oferta.milestones.map((m) => {
              const amount = result.milestoneAmounts.find((ma) => ma.id === m.id)?.amount ?? 0;
              return (
                <tr key={m.id}>
                  <td>
                    <input
                      value={m.name}
                      onChange={(e) => onChange(updateMilestone(project, m.id, { name: e.target.value }))}
                    />
                  </td>
                  <td>
                    <NumberField
                      className="number-input small"
                      value={m.percentage}
                      onCommit={(n) => onChange(updateMilestone(project, m.id, { percentage: n }))}
                    />
                  </td>
                  <td>
                    <select
                      value={m.linkedWbsId ?? ''}
                      onChange={(e) =>
                        onChange(updateMilestone(project, m.id, { linkedWbsId: e.target.value || undefined }))
                      }
                    >
                      <option value="">— sin vincular —</option>
                      {wbsFlat.map((n) => (
                        <option key={n.id} value={n.id}>
                          {'—'.repeat(n.depth)} {n.code} · {n.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="cost-cell">{formatUSD(amount)}</td>
                  <td>
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={() => onChange(removeMilestone(project, m.id))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
            {oferta.milestones.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">Sin hitos definidos todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
        <button
          type="button"
          className="add-milestone-btn"
          onClick={() => onChange(addMilestone(project, { name: 'Nuevo hito', percentage: 0 }))}
        >
          + Agregar hito
        </button>
      </section>
    </div>
  );
}

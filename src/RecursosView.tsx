import { useMemo, useState } from 'react';
import {
  addAssignment,
  addRubroDetallado,
  addRubroSecundario,
  addTarifa,
  buildWbsTree,
  calculateAssignmentCost,
  removeAssignment,
  removeRubroDetallado,
  removeRubroSecundario,
  removeTarifa,
  renameRubroSecundario,
  updateAssignment,
  updateRubroDetallado,
  updateTarifa,
  type ProjectData,
  type TarifaUnit,
  type TimeUnit,
  type WbsTreeNode,
} from './engine';

const TARIFA_UNITS: TarifaUnit[] = [
  'Hora', 'Día', 'Semana', 'Mes', 'Global', 'Kit', 'Punto', 'Evento', 'Lote',
  'Millar', 'Lámina', 'Unidad', 'Equipo', 'Vehículo', 'Oficina', '% Remuneración',
];
const TIME_UNITS: TimeUnit[] = ['Hora', 'Día', 'Semana', 'Mes', '-'];

function formatUSD(n: number): string {
  return n.toLocaleString('es-EC', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function flattenWbs(nodes: WbsTreeNode[], depth = 0): Array<{ id: string; code: string; name: string; depth: number }> {
  return nodes.flatMap((n) => [
    { id: n.id, code: n.code, name: n.name, depth },
    ...flattenWbs(n.children, depth + 1),
  ]);
}

export default function RecursosView({
  project,
  onChange,
}: {
  project: ProjectData;
  onChange: (next: ProjectData) => void;
}) {
  const [selectedN2, setSelectedN2] = useState<string | null>(null);
  const [selectedN3, setSelectedN3] = useState<string | null>(null);
  const [selectedN4, setSelectedN4] = useState<string | null>(null);
  const [newN3Name, setNewN3Name] = useState('');
  const [newN4Name, setNewN4Name] = useState('');
  const [newTarifa, setNewTarifa] = useState({ supplier: '', unitCost: '', unit: 'Mes' as TarifaUnit });
  const [newAssignment, setNewAssignment] = useState({
    wbsNodeId: '', tarifaId: '', quantity: '1', quantityUnit: 'Persona', time: '1', timeUnit: 'Mes' as TimeUnit,
    isProrated: false,
  });

  const wbsFlat = useMemo(() => flattenWbs(buildWbsTree(project.elementosWbs)), [project.elementosWbs]);

  const rubrosPrincipales = useMemo(
    () => Object.values(project.rubrosPrincipales).sort((a, b) => a.name.localeCompare(b.name)),
    [project.rubrosPrincipales]
  );
  const rubrosSecundarios = useMemo(
    () =>
      selectedN2
        ? Object.values(project.rubrosSecundarios).filter((s) => s.parentId === selectedN2)
        : [],
    [project.rubrosSecundarios, selectedN2]
  );
  const rubrosDetallados = useMemo(
    () =>
      selectedN3
        ? Object.values(project.rubrosDetallados).filter((d) => d.parentId === selectedN3)
        : [],
    [project.rubrosDetallados, selectedN3]
  );
  const tarifas = useMemo(
    () => (selectedN4 ? Object.values(project.tarifas).filter((t) => t.parentId === selectedN4) : []),
    [project.tarifas, selectedN4]
  );

  const tarifaOptions = useMemo(
    () =>
      Object.values(project.tarifas)
        .map((t) => {
          const n4 = project.rubrosDetallados[t.parentId];
          return { id: t.id, label: `${n4?.name ?? '?'} — ${t.supplier} ($${t.unitCost}/${t.unit})` };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [project.tarifas, project.rubrosDetallados]
  );

  const assignments = useMemo(
    () =>
      Object.values(project.recursosWbs).map((a) => {
        const tarifa = project.tarifas[a.tarifaId];
        const n4 = tarifa ? project.rubrosDetallados[tarifa.parentId] : undefined;
        const wbsNode = project.elementosWbs[a.elementoWbsId];
        const cost = tarifa ? calculateAssignmentCost(a, tarifa.unitCost, tarifa.unit) : 0;
        return { assignment: a, tarifa, n4, wbsNode, cost };
      }),
    [project.recursosWbs, project.tarifas, project.rubrosDetallados, project.elementosWbs]
  );

  const selectN2 = (id: string) => {
    setSelectedN2(id);
    setSelectedN3(null);
    setSelectedN4(null);
  };
  const selectN3 = (id: string) => {
    setSelectedN3(id);
    setSelectedN4(null);
  };

  return (
    <div className="recursos">
      <section className="panel">
        <h2>Catálogo de Recursos (N1–N5)</h2>
        <p className="hint">
          N1 (Categoría) y N2 (Rubro Principal) son fijos. Crea Rubros Secundarios,
          Rubros Detallados y Tarifas debajo de ellos.
        </p>
        <div className="catalog-columns">
          <div className="col">
            <h3>N2 · Rubro Principal</h3>
            <ul className="col-list">
              {rubrosPrincipales.map((rp) => (
                <li key={rp.id}>
                  <button
                    type="button"
                    className={rp.id === selectedN2 ? 'col-item active' : 'col-item'}
                    onClick={() => selectN2(rp.id)}
                  >
                    {rp.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="col">
            <h3>N3 · Rubro Secundario</h3>
            {selectedN2 ? (
              <>
                <ul className="col-list">
                  {rubrosSecundarios.map((rs) => (
                    <li key={rs.id} className="col-row">
                      <button
                        type="button"
                        className={rs.id === selectedN3 ? 'col-item active' : 'col-item'}
                        onClick={() => selectN3(rs.id)}
                      >
                        {rs.name}
                      </button>
                      <input
                        className="rename-input"
                        value={rs.name}
                        onChange={(e) => onChange(renameRubroSecundario(project, rs.id, e.target.value))}
                      />
                      <button
                        type="button"
                        className="danger-btn"
                        title="Eliminar (borra en cascada N4/N5/asignaciones)"
                        onClick={() => {
                          onChange(removeRubroSecundario(project, rs.id));
                          if (selectedN3 === rs.id) setSelectedN3(null);
                        }}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newN3Name.trim()) return;
                    onChange(addRubroSecundario(project, selectedN2, newN3Name.trim()));
                    setNewN3Name('');
                  }}
                >
                  <input
                    placeholder="Nuevo rubro secundario…"
                    value={newN3Name}
                    onChange={(e) => setNewN3Name(e.target.value)}
                  />
                  <button type="submit">+ Agregar</button>
                </form>
              </>
            ) : (
              <p className="hint">Selecciona un N2.</p>
            )}
          </div>

          <div className="col">
            <h3>N4 · Rubro Detallado</h3>
            {selectedN3 ? (
              <>
                <ul className="col-list">
                  {rubrosDetallados.map((rd) => (
                    <li key={rd.id} className="col-row">
                      <button
                        type="button"
                        className={rd.id === selectedN4 ? 'col-item active' : 'col-item'}
                        onClick={() => setSelectedN4(rd.id)}
                      >
                        {rd.name}
                      </button>
                      <input
                        className="rename-input"
                        value={rd.name}
                        onChange={(e) => onChange(updateRubroDetallado(project, rd.id, { name: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="danger-btn"
                        title="Eliminar (borra en cascada N5/asignaciones)"
                        onClick={() => {
                          onChange(removeRubroDetallado(project, rd.id));
                          if (selectedN4 === rd.id) setSelectedN4(null);
                        }}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newN4Name.trim()) return;
                    onChange(addRubroDetallado(project, selectedN3, newN4Name.trim()));
                    setNewN4Name('');
                  }}
                >
                  <input
                    placeholder="Nuevo rubro detallado…"
                    value={newN4Name}
                    onChange={(e) => setNewN4Name(e.target.value)}
                  />
                  <button type="submit">+ Agregar</button>
                </form>
              </>
            ) : (
              <p className="hint">Selecciona un N3.</p>
            )}
          </div>

          <div className="col">
            <h3>N5 · Tarifas</h3>
            {selectedN4 ? (
              <>
                <ul className="col-list">
                  {tarifas.map((t) => (
                    <li key={t.id} className="tarifa-row">
                      <input
                        className="rename-input"
                        value={t.supplier}
                        onChange={(e) => onChange(updateTarifa(project, t.id, { supplier: e.target.value }))}
                      />
                      <input
                        type="number"
                        className="number-input"
                        value={t.unitCost}
                        onChange={(e) => onChange(updateTarifa(project, t.id, { unitCost: Number(e.target.value) }))}
                      />
                      <select
                        value={t.unit}
                        onChange={(e) => onChange(updateTarifa(project, t.id, { unit: e.target.value as TarifaUnit }))}
                      >
                        {TARIFA_UNITS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                      <button type="button" className="danger-btn" onClick={() => onChange(removeTarifa(project, t.id))}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <form
                  className="inline-form tarifa-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cost = Number(newTarifa.unitCost);
                    if (!newTarifa.supplier.trim() || Number.isNaN(cost)) return;
                    onChange(addTarifa(project, selectedN4, newTarifa.supplier.trim(), cost, newTarifa.unit));
                    setNewTarifa({ supplier: '', unitCost: '', unit: 'Mes' });
                  }}
                >
                  <input
                    placeholder="Proveedor…"
                    value={newTarifa.supplier}
                    onChange={(e) => setNewTarifa({ ...newTarifa, supplier: e.target.value })}
                  />
                  <input
                    type="number"
                    placeholder="Costo"
                    className="number-input"
                    value={newTarifa.unitCost}
                    onChange={(e) => setNewTarifa({ ...newTarifa, unitCost: e.target.value })}
                  />
                  <select
                    value={newTarifa.unit}
                    onChange={(e) => setNewTarifa({ ...newTarifa, unit: e.target.value as TarifaUnit })}
                  >
                    {TARIFA_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <button type="submit">+ Agregar</button>
                </form>
              </>
            ) : (
              <p className="hint">Selecciona un N4.</p>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Asignaciones de Recursos (recursos_wbs)</h2>
        <table className="assignments-table">
          <thead>
            <tr>
              <th>Nodo WBS</th>
              <th>Recurso</th>
              <th>Proveedor</th>
              <th>Cant.</th>
              <th>Tiempo</th>
              <th>Prorrateado</th>
              <th>Costo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map(({ assignment, tarifa, n4, wbsNode, cost }) => (
              <tr key={assignment.id}>
                <td>{wbsNode ? `${wbsNode.code} — ${wbsNode.name}` : '(nodo eliminado)'}</td>
                <td>{n4?.name ?? '(recurso eliminado)'}</td>
                <td>{tarifa?.supplier ?? '—'}</td>
                <td>
                  <input
                    type="number"
                    className="number-input small"
                    value={assignment.quantity}
                    onChange={(e) =>
                      onChange(updateAssignment(project, assignment.id, { quantity: Number(e.target.value) }))
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="number-input small"
                    value={assignment.time}
                    onChange={(e) =>
                      onChange(updateAssignment(project, assignment.id, { time: Number(e.target.value) }))
                    }
                  />{' '}
                  {assignment.timeUnit}
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={assignment.isProrated ?? false}
                    onChange={(e) =>
                      onChange(updateAssignment(project, assignment.id, { isProrated: e.target.checked }))
                    }
                  />
                </td>
                <td className="cost-cell">{formatUSD(cost)}</td>
                <td>
                  <button type="button" className="danger-btn" onClick={() => onChange(removeAssignment(project, assignment.id))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr>
                <td colSpan={8} className="hint">Sin asignaciones todavía.</td>
              </tr>
            )}
          </tbody>
        </table>

        <form
          className="assignment-form"
          onSubmit={(e) => {
            e.preventDefault();
            const quantity = Number(newAssignment.quantity);
            const time = Number(newAssignment.time);
            if (!newAssignment.wbsNodeId || !newAssignment.tarifaId || Number.isNaN(quantity) || Number.isNaN(time)) return;
            onChange(
              addAssignment(project, {
                elementoWbsId: newAssignment.wbsNodeId,
                tarifaId: newAssignment.tarifaId,
                quantity,
                quantityUnit: newAssignment.quantityUnit,
                time,
                timeUnit: newAssignment.timeUnit,
                isProrated: newAssignment.isProrated,
              })
            );
            setNewAssignment({ ...newAssignment, quantity: '1', time: '1' });
          }}
        >
          <h3>Nueva asignación</h3>
          <div className="assignment-form-grid">
            <select
              value={newAssignment.wbsNodeId}
              onChange={(e) => setNewAssignment({ ...newAssignment, wbsNodeId: e.target.value })}
            >
              <option value="">Nodo WBS…</option>
              {wbsFlat.map((n) => (
                <option key={n.id} value={n.id}>
                  {'—'.repeat(n.depth)} {n.code} · {n.name}
                </option>
              ))}
            </select>
            <select
              value={newAssignment.tarifaId}
              onChange={(e) => setNewAssignment({ ...newAssignment, tarifaId: e.target.value })}
            >
              <option value="">Tarifa (recurso)…</option>
              {tarifaOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Cantidad"
              className="number-input"
              value={newAssignment.quantity}
              onChange={(e) => setNewAssignment({ ...newAssignment, quantity: e.target.value })}
            />
            <input
              placeholder="Unidad cant. (Persona, Equipo…)"
              value={newAssignment.quantityUnit}
              onChange={(e) => setNewAssignment({ ...newAssignment, quantityUnit: e.target.value })}
            />
            <input
              type="number"
              placeholder="Tiempo"
              className="number-input"
              value={newAssignment.time}
              onChange={(e) => setNewAssignment({ ...newAssignment, time: e.target.value })}
            />
            <select
              value={newAssignment.timeUnit}
              onChange={(e) => setNewAssignment({ ...newAssignment, timeUnit: e.target.value as TimeUnit })}
            >
              {TIME_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={newAssignment.isProrated}
                onChange={(e) => setNewAssignment({ ...newAssignment, isProrated: e.target.checked })}
              />
              Forzar prorrateo por duración
            </label>
            <button type="submit">+ Agregar asignación</button>
          </div>
        </form>
      </section>
    </div>
  );
}

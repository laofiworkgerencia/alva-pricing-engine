import { useMemo, useState, type ChangeEvent } from 'react';
import './App.css';
import {
  buildWbsTree,
  calculate,
  parseProjectFile,
  serializeProjectFileToWireJson,
  ProjectImportError,
  type PricingResult,
  type ProjectData,
  type WbsTreeNode,
} from './engine';
import { sampleProjectWireJson } from './sampleProject';

function formatUSD(n: number): string {
  return n.toLocaleString('es-EC', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

function WbsTreeRows({
  nodes,
  costByNode,
  depth = 0,
}: {
  nodes: WbsTreeNode[];
  costByNode: PricingResult['costByNode'];
  depth?: number;
}) {
  return (
    <>
      {nodes.map((n) => (
        <div key={n.id}>
          <div className="wbs-row" style={{ paddingLeft: depth * 20 }}>
            <span className="wbs-code">{n.code}</span>
            <span className={`wbs-level level-${n.levelType}`}>{n.levelType}</span>
            <span className="wbs-name">{n.name}</span>
            <span className="wbs-cost">{formatUSD(costByNode[n.id]?.total ?? 0)}</span>
          </div>
          {n.children.length > 0 && (
            <WbsTreeRows nodes={n.children} costByNode={costByNode} depth={depth + 1} />
          )}
        </div>
      ))}
    </>
  );
}

export default function App() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo<PricingResult | null>(() => {
    if (!project) return null;
    return calculate(
      project.elementosWbs,
      project.recursosWbs,
      {
        categorias: project.categorias,
        rubrosPrincipales: project.rubrosPrincipales,
        rubrosSecundarios: project.rubrosSecundarios,
        rubrosDetallados: project.rubrosDetallados,
        tarifas: project.tarifas,
      },
      project.ofertaComercial
    );
  }, [project]);

  const tree = useMemo(
    () => (project ? buildWbsTree(project.elementosWbs) : []),
    [project]
  );

  const applyProject = (raw: unknown) => {
    try {
      setProject(parseProjectFile(raw));
      setError(null);
    } catch (e) {
      setProject(null);
      setError(e instanceof ProjectImportError ? e.message : 'Error inesperado al leer el proyecto.');
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyProject(JSON.parse(String(reader.result)));
      } catch {
        setProject(null);
        setError('El archivo no es un JSON válido.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportProject = () => {
    if (!project) return;
    const json = serializeProjectFileToWireJson(project);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.ofertaComercial.quoteSequence || 'proyecto'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>ALVA Pricing Engine</h1>
        <p>
          Núcleo reescrito y con tests del motor de precios de Cotizador ALVA v3
          (PricingEngine, AutoQuoterEngine, parser WBS). Lee y escribe el mismo
          formato de archivo <code>.json</code> ("LaOfi S.A.S.") que la app
          original — no reemplaza la interfaz completa.
        </p>
      </header>

      <section className="toolbar">
        <button type="button" onClick={() => applyProject(sampleProjectWireJson)}>
          Cargar proyecto de ejemplo
        </button>
        <label className="file-btn">
          Importar proyecto (.json)
          <input type="file" accept="application/json" onChange={onFileChange} />
        </label>
        <button type="button" onClick={exportProject} disabled={!project}>
          Exportar proyecto (.json)
        </button>
      </section>

      {error && <div className="error-banner">{error}</div>}

      {!project && !error && (
        <p className="empty-state">
          Carga el proyecto de ejemplo o importa un archivo exportado desde el
          Cotizador ALVA v3 para ver el cálculo de costos.
        </p>
      )}

      {project && result && (
        <div className="layout">
          <section className="panel">
            <h2>
              WBS — {project.ofertaComercial.projectNameFull || project.ofertaComercial.projectName}
            </h2>
            <div className="wbs-row wbs-header">
              <span className="wbs-code">Código</span>
              <span className="wbs-level">Nivel</span>
              <span className="wbs-name">Nombre</span>
              <span className="wbs-cost">Costo</span>
            </div>
            <WbsTreeRows nodes={tree} costByNode={result.costByNode} />
          </section>

          <section className="panel summary">
            <h2>Resumen Financiero (A.I.U.)</h2>
            <table>
              <tbody>
                <tr>
                  <td>Costo Base</td>
                  <td>{formatUSD(result.summary.costBase)}</td>
                </tr>
                <tr>
                  <td>Seguros ({project.ofertaComercial.globalInsurance}%)</td>
                  <td>{formatUSD(result.summary.insurance)}</td>
                </tr>
                <tr>
                  <td>Imprevistos ({project.ofertaComercial.globalContingency}%)</td>
                  <td>{formatUSD(result.summary.contingency)}</td>
                </tr>
                <tr>
                  <td>Utilidad ({project.ofertaComercial.globalProfit}%)</td>
                  <td>{formatUSD(result.summary.profit)}</td>
                </tr>
                <tr className="subtotal">
                  <td>Subtotal Bruto</td>
                  <td>{formatUSD(result.summary.subtotalGross)}</td>
                </tr>
                <tr>
                  <td>Descuento</td>
                  <td>-{formatUSD(result.summary.discount)}</td>
                </tr>
                <tr className="total">
                  <td>TOTAL (PVP)</td>
                  <td>{formatUSD(result.summary.total)}</td>
                </tr>
              </tbody>
            </table>

            <h3>Hitos de Facturación</h3>
            <table>
              <tbody>
                {result.milestoneAmounts.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.name} ({m.percentage}%)
                    </td>
                    <td>{formatUSD(m.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {result.warnings.length > 0 && (
              <div className="warnings">
                <h3>Advertencias</h3>
                <ul>
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

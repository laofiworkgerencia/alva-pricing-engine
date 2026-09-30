import { useMemo, useState, type ChangeEvent } from 'react';
import {
  buildClassicProposalLines,
  buildClassicProposalMilestones,
  updateOfertaComercial,
  type ContextoTerritorial,
  type PricingResult,
  type ProjectData,
} from './engine';
import { formatUSD } from './format';

export default function PropuestaClasicaView({
  project,
  result,
  onChange,
}: {
  project: ProjectData;
  result: PricingResult;
  onChange: (next: ProjectData) => void;
}) {
  const oferta = project.ofertaComercial;
  const ctx = oferta.contextoTerritorial ?? {};

  // El logo, igual que en la app original, es solo estado de sesión: no
  // viaja en el JSON exportado ni sobrevive a un recargo de página.
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const lines = useMemo(() => buildClassicProposalLines(project, result), [project, result]);
  const milestones = useMemo(
    () => buildClassicProposalMilestones(project, result),
    [project, result]
  );

  const patchCtx = (patch: Partial<ContextoTerritorial>) =>
    onChange(updateOfertaComercial(project, { contextoTerritorial: { ...ctx, ...patch } }));

  const onLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const exportDocx = async () => {
    setExporting(true);
    try {
      // Import dinámico: la librería docx (~400kB) solo se descarga cuando
      // el usuario realmente exporta, no en el bundle principal de la app.
      const [{ buildClassicProposalDocx }, { Packer }] = await Promise.all([
        import('./engine/classicDocxExport'),
        import('docx'),
      ]);
      const doc = buildClassicProposalDocx(project, result);
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ALVA-${oferta.quoteSequence || 'propuesta'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="clasica-layout">
      <section className="panel">
        <h2>Parámetros de Oferta Clásica</h2>

        <label className="block-label">
          Logo corporativo
          <input type="file" accept="image/*" onChange={onLogoChange} />
        </label>

        <label className="block-label">
          Nivel de detalle del WBS ({oferta.maxDetailLevel})
          <input
            type="range"
            min={1}
            max={4}
            step={1}
            value={oferta.maxDetailLevel}
            onChange={(e) =>
              onChange(updateOfertaComercial(project, { maxDetailLevel: Number(e.target.value) }))
            }
          />
        </label>

        <div className="ctx-territorial">
          <h3>Contexto Territorial (opcional)</h3>
          <p className="hint">
            Datos generales del cliente/territorio para incluir en la propuesta. A diferencia del
            original (que tenía una tabla censal fija solo para un cliente específico), aquí es
            libre para cualquier proyecto.
          </p>
          <div className="form-grid">
            <label>
              Área total (km²)
              <input
                type="number"
                value={ctx.areaTotalKm2 ?? ''}
                onChange={(e) => patchCtx({ areaTotalKm2: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
            <label>
              Población total
              <input
                type="number"
                value={ctx.poblacionTotal ?? ''}
                onChange={(e) => patchCtx({ poblacionTotal: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
            <label>
              Hogares
              <input
                type="number"
                value={ctx.hogaresTotal ?? ''}
                onChange={(e) => patchCtx({ hogaresTotal: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
            <label>
              Edificaciones
              <input
                type="number"
                value={ctx.edificacionesTotal ?? ''}
                onChange={(e) => patchCtx({ edificacionesTotal: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
            <label className="full-width">
              Notas / fuente
              <textarea
                rows={2}
                value={ctx.notas ?? ''}
                onChange={(e) => patchCtx({ notas: e.target.value })}
              />
            </label>
          </div>
        </div>

        <button type="button" className="export-docx-btn" onClick={exportDocx} disabled={exporting}>
          {exporting ? 'Generando...' : '⬇ Exportar DOCX (Clásico)'}
        </button>
      </section>

      <section className="panel doc-preview">
        <div className="doc-header">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="Logo" className="doc-logo" />
          ) : (
            <div className="doc-logo-placeholder">ALVA INGENIERÍA</div>
          )}
          <div className="doc-header-right">
            <h1>PROPUESTA ECONÓMICA</h1>
            <p className="doc-seq">ALVA-{oferta.quoteSequence}</p>
            <p>Fecha: {oferta.date}</p>
          </div>
        </div>

        <h2 className="doc-project-name">{oferta.projectNameFull || oferta.projectName}</h2>
        <h3 className="doc-client">Cliente: {oferta.clientName}</h3>
        <p className="doc-intro">{oferta.introText}</p>

        {(ctx.areaTotalKm2 || ctx.poblacionTotal || ctx.hogaresTotal || ctx.edificacionesTotal) && (
          <div className="doc-section">
            <h4>Contexto Territorial</h4>
            <table className="doc-table">
              <tbody>
                {ctx.areaTotalKm2 != null && <tr><td>Área Total</td><td>{ctx.areaTotalKm2} km²</td></tr>}
                {ctx.poblacionTotal != null && <tr><td>Población Total</td><td>{ctx.poblacionTotal}</td></tr>}
                {ctx.hogaresTotal != null && <tr><td>Hogares</td><td>{ctx.hogaresTotal}</td></tr>}
                {ctx.edificacionesTotal != null && <tr><td>Edificaciones</td><td>{ctx.edificacionesTotal}</td></tr>}
              </tbody>
            </table>
            {ctx.notas && <p className="doc-notas">{ctx.notas}</p>}
          </div>
        )}

        {project.narrativa.alerta_normativa?.texto && (
          <div className="doc-section">
            <h4>Alerta Normativa</h4>
            <p>{project.narrativa.alerta_normativa.texto}</p>
          </div>
        )}
        {project.narrativa.solucion?.texto && (
          <div className="doc-section">
            <h4>Visión y Metodología</h4>
            <p>{project.narrativa.solucion.texto}</p>
          </div>
        )}

        <table className="doc-table word-table">
          <thead>
            <tr><th>WBS</th><th>Detalle y Entregables</th><th className="num">Costo</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className={l.isRoot ? 'doc-row-root' : ''}>
                <td className="mono">{l.code}</td>
                <td>
                  <div className="doc-line-name">{l.name}</div>
                  {l.descGeneral && <div className="doc-line-desc">{l.descGeneral}</div>}
                  {l.deliverables.length > 0 && (
                    <div className="doc-deliverables">Entregables: {l.deliverables.join(', ')}</div>
                  )}
                </td>
                <td className="num mono">{formatUSD(l.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4>Cronograma de Ejecución</h4>
        <table className="doc-table">
          <thead>
            <tr><th>WBS</th><th>Elemento</th><th className="num">Inicio</th><th className="num">Fin</th><th className="num">Duración</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={`sched-${l.id}`}>
                <td className="mono">{l.code}</td>
                <td className={l.isRoot ? 'doc-line-name' : ''}>{l.name}</td>
                <td className="num mono">{l.startDay}</td>
                <td className="num mono">{l.endDay}</td>
                <td className="num mono">{l.duration}d</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="doc-total-table">
          <tbody>
            <tr><td>TOTAL OFERTA:</td><td className="mono">{formatUSD(result.summary.total)}</td></tr>
          </tbody>
        </table>

        <h4>Plan de Entregas y Facturación</h4>
        <table className="doc-table">
          <thead>
            <tr><th>Hito de Pago</th><th className="num">%</th><th className="num">Monto</th></tr>
          </thead>
          <tbody>
            {milestones.map((m, idx) => (
              <tr key={m.id}>
                <td>
                  <div className="doc-line-name">Hito {idx + 1}: {m.name}</div>
                  <div className="doc-line-desc">
                    {m.linkedNode
                      ? `Condición: Aprobación de ${m.linkedNode.code} ${m.linkedNode.name}. Plazo estimado: día ${m.linkedNode.endDay}.`
                      : 'Condición: Anticipo / Firma de contrato.'}
                  </div>
                </td>
                <td className="num">{m.percentage}%</td>
                <td className="num mono">{formatUSD(m.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="doc-footer">
          <strong>ALVA INGENIERÍA</strong>
          <p>Documento comercial generado automáticamente. Válido por 30 días.</p>
        </div>
      </section>
    </div>
  );
}

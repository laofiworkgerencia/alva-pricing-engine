import {
  AlignmentType,
  Document,
  HeadingLevel,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { buildClassicProposalLines, buildClassicProposalMilestones } from './classicProposal';
import type { PricingResult } from './pricingEngine';
import type { ProjectData } from './types';

// Genera un .docx real (OOXML), en vez del truco HTML→.doc del original
// (ver generateWordDoc() en CotizadorApp.jsx: un blob 'application/msword'
// con HTML crudo, que Word abre pero no es un documento Word genuino).

const NAVY = '0B2046';
const ORANGE = 'E67E22';
const GRAY = '4B5563';

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function textCell(
  lines: string | string[],
  opts: {
    width?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    color?: string;
    shading?: string;
  } = {}
): TableCell {
  const arr = (Array.isArray(lines) ? lines : [lines]).filter((l) => l && l.trim() !== '');
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shading ? { fill: opts.shading } : undefined,
    children: (arr.length > 0 ? arr : ['']).map(
      (t, i) =>
        new Paragraph({
          alignment: opts.align,
          children: [
            new TextRun({
              text: t,
              bold: i === 0 ? opts.bold : false,
              color: opts.shading ? 'FFFFFF' : opts.color,
              size: i === 0 ? undefined : 18,
            }),
          ],
        })
    ),
  });
}

function headerRow(cols: Array<[string, number]>): TableRow {
  return new TableRow({
    children: cols.map(([text, width]) =>
      textCell(text, { width, bold: true, shading: NAVY })
    ),
  });
}

export function buildClassicProposalDocx(project: ProjectData, result: PricingResult): Document {
  const oferta = project.ofertaComercial;
  const lines = buildClassicProposalLines(project, result);
  const milestones = buildClassicProposalMilestones(project, result);
  const ctx = oferta.contextoTerritorial;
  const hasCtx =
    !!ctx &&
    (ctx.areaTotalKm2 || ctx.poblacionTotal || ctx.hogaresTotal || ctx.edificacionesTotal || ctx.notas);

  const children: Array<Paragraph | Table> = [
    new Paragraph({
      children: [new TextRun({ text: 'PROPUESTA ECONÓMICA', bold: true, color: NAVY, size: 32 })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `ALVA-${oferta.quoteSequence}`, font: 'Courier New', bold: true, color: GRAY })],
    }),
    new Paragraph({ children: [new TextRun({ text: `Fecha: ${oferta.date}`, color: GRAY })] }),
    new Paragraph({ text: '' }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: oferta.projectNameFull || oferta.projectName })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Cliente: ${oferta.clientName}`, color: ORANGE, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text: oferta.introText || '' })],
    }),
  ];

  if (hasCtx) {
    children.push(
      new Paragraph({ text: '' }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'Contexto Territorial', color: NAVY })],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          ...(ctx!.areaTotalKm2
            ? [new TableRow({ children: [textCell('Área Total', { width: 40, bold: true }), textCell(`${ctx!.areaTotalKm2} km²`)] })]
            : []),
          ...(ctx!.poblacionTotal
            ? [new TableRow({ children: [textCell('Población Total', { width: 40, bold: true }), textCell(String(ctx!.poblacionTotal))] })]
            : []),
          ...(ctx!.hogaresTotal
            ? [new TableRow({ children: [textCell('Hogares', { width: 40, bold: true }), textCell(String(ctx!.hogaresTotal))] })]
            : []),
          ...(ctx!.edificacionesTotal
            ? [new TableRow({ children: [textCell('Edificaciones', { width: 40, bold: true }), textCell(String(ctx!.edificacionesTotal))] })]
            : []),
        ],
      }),
      ...(ctx!.notas ? [new Paragraph({ children: [new TextRun({ text: ctx!.notas, italics: true, size: 18, color: GRAY })] })] : [])
    );
  }

  const alerta = project.narrativa.alerta_normativa?.texto;
  if (alerta) {
    children.push(
      new Paragraph({ text: '' }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'Alerta Normativa', color: NAVY })],
      }),
      new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: alerta })] })
    );
  }

  const solucion = project.narrativa.solucion?.texto;
  if (solucion) {
    children.push(
      new Paragraph({ text: '' }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'Visión y Metodología', color: NAVY })],
      }),
      new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: solucion })] })
    );
  }

  children.push(
    new Paragraph({ text: '' }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        headerRow([
          ['WBS', 15],
          ['Detalle y Entregables', 65],
          ['Costo Comercial', 20],
        ]),
        ...lines.map(
          (l) =>
            new TableRow({
              children: [
                textCell(l.code, { width: 15 }),
                textCell(
                  [
                    l.name,
                    l.descGeneral,
                    l.deliverables.length > 0 ? `Entregables: ${l.deliverables.join(', ')}` : '',
                  ],
                  { width: 65, bold: l.isRoot }
                ),
                textCell(money(l.cost), { width: 20, align: AlignmentType.RIGHT, bold: l.isRoot }),
              ],
            })
        ),
      ],
    })
  );

  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Cronograma de Ejecución', color: NAVY })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        headerRow([
          ['WBS', 15],
          ['Elemento', 45],
          ['Día Inicio', 13],
          ['Día Fin', 13],
          ['Duración', 14],
        ]),
        ...lines.map(
          (l) =>
            new TableRow({
              children: [
                textCell(l.code, { width: 15 }),
                textCell(l.name, { width: 45, bold: l.isRoot }),
                textCell(String(l.startDay), { width: 13, align: AlignmentType.RIGHT }),
                textCell(String(l.endDay), { width: 13, align: AlignmentType.RIGHT }),
                textCell(`${l.duration}d`, { width: 14, align: AlignmentType.RIGHT }),
              ],
            })
        ),
      ],
    })
  );

  children.push(
    new Paragraph({ text: '' }),
    new Table({
      width: { size: 45, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.RIGHT,
      rows: [
        new TableRow({
          children: [
            textCell('TOTAL OFERTA', { width: 50, bold: true }),
            textCell(money(result.summary.total), { width: 50, align: AlignmentType.RIGHT, bold: true }),
          ],
        }),
      ],
    })
  );

  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Plan de Entregas y Facturación', color: NAVY })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        headerRow([
          ['Hito de Pago', 55],
          ['%', 15],
          ['Monto a Facturar', 30],
        ]),
        ...milestones.map(
          (m, idx) =>
            new TableRow({
              children: [
                textCell(
                  [
                    `Hito ${idx + 1}: ${m.name}`,
                    m.linkedNode
                      ? `Condición: Aprobación de ${m.linkedNode.code} ${m.linkedNode.name}. Plazo estimado: día ${m.linkedNode.endDay}.`
                      : 'Condición: Anticipo / Firma de contrato.',
                  ],
                  { width: 55 }
                ),
                textCell(`${m.percentage}%`, { width: 15, align: AlignmentType.CENTER }),
                textCell(money(m.amount), { width: 30, align: AlignmentType.RIGHT, bold: true }),
              ],
            })
        ),
      ],
    })
  );

  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'ALVA INGENIERÍA', bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'Documento comercial generado automáticamente. Válido por 30 días.',
          size: 16,
          color: GRAY,
        }),
      ],
    })
  );

  return new Document({ sections: [{ children }] });
}

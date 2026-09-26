import { describe, expect, it } from 'vitest';
import { calculate, parseProjectFile } from './engine';
import { sampleProjectWireJson } from './sampleProject';

describe('sampleProjectWireJson (ejemplo de SKILL.md, extremo a extremo)', () => {
  it('se importa y calcula sin advertencias, con el total esperado', () => {
    const project = parseProjectFile(sampleProjectWireJson);
    const result = calculate(
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

    expect(result.warnings).toHaveLength(0);

    // Directo: Especialista SIG en wbs-004 (única hoja) = 1500 * 0.5 = 750.
    // Compartido: Director de Proyecto (indirecto, asignado a la Fase) = 2178.57 * 1,
    // se prorratea 100% a wbs-004 por ser la única hoja activa de la rama.
    const expectedCostBase = 750 + 2178.57;
    expect(result.summary.costBase).toBeCloseTo(expectedCostBase, 2);
    expect(result.summary.profit).toBeCloseTo(expectedCostBase * 0.35, 2);
    expect(result.summary.total).toBeCloseTo(expectedCostBase * 1.35, 2);

    // Los 4 nodos de la única rama deben acumular el mismo costo total (rollup).
    expect(result.costByNode['wbs-001'].total).toBeCloseTo(expectedCostBase, 2);
    expect(result.costByNode['wbs-004'].total).toBeCloseTo(expectedCostBase, 2);

    // Hitos 30/70 sobre el total.
    expect(result.milestoneAmounts[0].amount).toBeCloseTo(expectedCostBase * 1.35 * 0.3, 2);
    expect(result.milestoneAmounts[1].amount).toBeCloseTo(expectedCostBase * 1.35 * 0.7, 2);
  });
});

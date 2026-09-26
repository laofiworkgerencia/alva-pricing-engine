import type { WbsNode } from './types';

export interface SuggestionRule {
  keywords: string[];
  resourceName: string;
}

/** Tabla de keywords → recurso sugerido, tal como la documenta SKILL.md §1.7. */
export const SUGGESTION_RULES: SuggestionRule[] = [
  { keywords: ['sig', 'gdb', 'cartografía', 'geodatabase', 'metadatos'], resourceName: 'Especialista SIG' },
  { keywords: ['legal', 'escritura', 'tenencia', 'saneamiento'], resourceName: 'Especialista Legal' },
  { keywords: ['geodesia', 'gnss', 'red', 'igm'], resourceName: 'Especialista Geodesta' },
  { keywords: ['dron', 'vant', 'vuelo', 'uav', 'fotogrametría'], resourceName: 'Piloto VANT + Dron VANT PPK' },
  { keywords: ['topografía', 'levantamiento', 'estación'], resourceName: 'Topógrafo' },
  { keywords: ['campo', 'barrido', 'encuesta', 'relevamiento', 'censo'], resourceName: 'Relevador / Encuestador' },
  { keywords: ['supervisor', 'control de calidad', 'qc'], resourceName: 'Supervisor de Campo' },
  { keywords: ['digitador', 'digitalizador', 'traspaso', 'carga'], resourceName: 'Digitador / Digitalizador' },
  { keywords: ['camioneta', 'vehículo', '4x4', 'transporte'], resourceName: 'Camionetas 4x4 Doble Cabina' },
  { keywords: ['hospedaje', 'hotel', 'alojamiento'], resourceName: 'Hospedaje Brigadas PVM' },
  { keywords: ['alimentación', 'comida'], resourceName: 'Alimentación de Campo' },
];

const PROJECT_MANAGER_RESOURCE = 'Director de Proyecto PMP';

export interface SuggestedAssignment {
  wbsNodeId: string;
  resourceName: string;
  /** Meses sugeridos (solo aplica a recursos basados en tiempo, ej. el Director de Proyecto). */
  timeMonths?: number;
  reason: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // quita acentos para comparar sin distinguirlos
}

function scanNodeText(node: WbsNode): string {
  return normalize(
    [node.descGeneral, node.descSmart, node.descTecnica].filter(Boolean).join(' ')
  );
}

/**
 * Coincidencia por límite de palabra: el original hacía un `includes` plano,
 * lo que produce falsos positivos (ej. "relevante" contiene "vant"). Aquí se
 * exige que la keyword aparezca como palabra/frase completa.
 */
function containsKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`).test(text);
}

/**
 * Sugiere recursos escaneando desc_general/desc_smart/desc_tecnica de cada nodo WBS
 * en busca de las keywords de SUGGESTION_RULES. Toda Fase recibe además un
 * "Director de Proyecto PMP" con tiempo = max(0.1, duración/30) meses.
 */
export function suggestAssignments(nodes: WbsNode[]): SuggestedAssignment[] {
  const suggestions: SuggestedAssignment[] = [];

  nodes.forEach((node) => {
    const text = scanNodeText(node);

    SUGGESTION_RULES.forEach((rule) => {
      const matched = rule.keywords.find((kw) => containsKeyword(text, normalize(kw)));
      if (matched) {
        suggestions.push({
          wbsNodeId: node.id,
          resourceName: rule.resourceName,
          reason: `Keyword "${matched}" encontrada en la descripción del nodo ${node.code}.`,
        });
      }
    });

    if (node.levelType === 'Fase') {
      suggestions.push({
        wbsNodeId: node.id,
        resourceName: PROJECT_MANAGER_RESOURCE,
        timeMonths: Math.max(0.1, node.duration / 30),
        reason: 'Regla de oro: toda Fase recibe un Director de Proyecto PMP.',
      });
    }
  });

  return suggestions;
}

import type { LevelType, WbsNode } from './types';

const HEADER_RE = /^([\d.]+)\s*-\s*(.*?)\s*\((.*?)\)/;
const SECTION_RE = /\*\*(\d)\.\s*[^:]*:\*\*\s*([\s\S]*?)(?=\n\*\*\d\.|\s*$)/g;

const SECTION_FIELD: Record<string, keyof WbsNode> = {
  '1': 'descGeneral',
  '2': 'descSmart',
  '4': 'descKpi',
  '5': 'descAporte',
  '6': 'descInsumos',
  '7': 'descTecnica',
};

function normalizeLevelType(raw: string): LevelType {
  const t = raw.trim().toLowerCase();
  return (t.charAt(0).toUpperCase() + t.slice(1)) as LevelType;
}

/** Extrae una duración en días de un texto tipo "30 días" o "2 meses". Default: 10 días. */
export function extractDuration(text: string | undefined): number {
  if (!text) return 10;
  const monthsMatch = text.match(/(\d+(?:[.,]\d+)?)\s*mes/i);
  if (monthsMatch) return parseFloat(monthsMatch[1].replace(',', '.')) * 30;
  const daysMatch = text.match(/(\d+(?:[.,]\d+)?)\s*d[ií]a/i);
  if (daysMatch) return parseFloat(daysMatch[1].replace(',', '.'));
  return 10;
}

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Parsea el formato Markdown del importador "Importar WBS (MD)" (SKILL.md Parte 2).
 * Divide por bloques `### `, extrae header (code - name (levelType)) y hasta 7
 * secciones `**N. TÍTULO:**`, y reconstruye la jerarquía por prefijo de código.
 */
export function parseMarkdownWBS(mdText: string): WbsNode[] {
  const blocks = mdText.split(/^###\s+/m).slice(1);
  const codeToId = new Map<string, string>();
  const parsed: Array<{ code: string } & Omit<WbsNode, 'parentId'>> = [];

  blocks.forEach((block) => {
    const headerLine = block.split('\n')[0];
    const headerMatch = headerLine.match(HEADER_RE);
    if (!headerMatch) return;

    const [, code, name, levelTypeRaw] = headerMatch;
    const id = generateId();
    codeToId.set(code.trim(), id);

    const node: { code: string } & Omit<WbsNode, 'parentId'> = {
      id,
      code: code.trim(),
      name: name.trim(),
      levelType: normalizeLevelType(levelTypeRaw),
      isActive: true,
      startDay: 1,
      duration: 10,
      descGeneral: '',
      descSmart: '',
      descKpi: '',
      descAporte: '',
      descInsumos: '',
      descTecnica: '',
      deliverable: '',
    };

    let match: RegExpExecArray | null;
    SECTION_RE.lastIndex = 0;
    while ((match = SECTION_RE.exec(block)) !== null) {
      const [, sectionNumber, content] = match;
      const field = SECTION_FIELD[sectionNumber];
      const value = content.trim();
      if (field) {
        (node as Record<string, unknown>)[field] = value;
      }
      if (sectionNumber === '3') {
        node.deliverable = value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).join(' | ');
      }
    }

    node.duration = extractDuration(node.descSmart);
    parsed.push(node);
  });

  return parsed.map((node) => {
    const lastDot = node.code.lastIndexOf('.');
    const parentCode = lastDot === -1 ? null : node.code.slice(0, lastDot);
    const parentId = parentCode ? codeToId.get(parentCode) ?? null : null;
    return { ...node, parentId };
  });
}

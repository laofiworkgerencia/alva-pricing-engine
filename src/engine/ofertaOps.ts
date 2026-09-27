import { generateId } from './id';
import type { Milestone, NarrativeSectionId, OfertaComercial, ProjectData } from './types';

export function updateOfertaComercial(
  project: ProjectData,
  patch: Partial<OfertaComercial>
): ProjectData {
  return { ...project, ofertaComercial: { ...project.ofertaComercial, ...patch } };
}

export function addMilestone(
  project: ProjectData,
  input: Omit<Milestone, 'id'>
): ProjectData {
  const milestone: Milestone = { ...input, id: generateId() };
  return {
    ...project,
    ofertaComercial: {
      ...project.ofertaComercial,
      milestones: [...project.ofertaComercial.milestones, milestone],
    },
  };
}

export function updateMilestone(
  project: ProjectData,
  id: string,
  patch: Partial<Omit<Milestone, 'id'>>
): ProjectData {
  return {
    ...project,
    ofertaComercial: {
      ...project.ofertaComercial,
      milestones: project.ofertaComercial.milestones.map((m) =>
        m.id === id ? { ...m, ...patch } : m
      ),
    },
  };
}

export function updateNarrativeSection(
  project: ProjectData,
  sectionId: NarrativeSectionId,
  texto: string
): ProjectData {
  return {
    ...project,
    narrativa: { ...project.narrativa, [sectionId]: { texto } },
  };
}

export function removeMilestone(project: ProjectData, id: string): ProjectData {
  return {
    ...project,
    ofertaComercial: {
      ...project.ofertaComercial,
      milestones: project.ofertaComercial.milestones.filter((m) => m.id !== id),
    },
  };
}

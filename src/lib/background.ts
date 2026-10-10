import { z } from 'zod';

/**
 * The "background profile": what the user shares about themselves before a conversation.
 * Not to be confused with `profile.ts`, which stores saved sessions.
 * Every item says where it came from (stated or inferred) and quotes the document line behind it.
 */
export const BACKGROUND_KINDS = [
  { id: 'basics', label: 'Basics', hint: 'Studies, work, languages. Not used for live comments.' },
  { id: 'strength', label: 'Strengths', hint: 'What you are good at, with proof.' },
  { id: 'hardSkill', label: 'Hard skills', hint: 'Tools, methods, technical skills.' },
  { id: 'softSkill', label: 'Soft skills', hint: 'Working with people, communication, leadership.' },
  { id: 'canDo', label: 'What you can do', hint: 'Things your documents show you have actually done.' },
  { id: 'implicit', label: 'What your work shows', hint: 'Skills implied by your experience but never written down.' },
  { id: 'improve', label: 'Room for improvement', hint: 'Thin or missing evidence. Not shown in your documents is not the same as unable.' },
  { id: 'beware', label: 'What to beware of', hint: 'Likely pressure points: gaps, claims that are hard to back up.' },
] as const;
export type BackgroundKind = (typeof BACKGROUND_KINDS)[number]['id'];
const KIND_IDS = BACKGROUND_KINDS.map(kind => kind.id) as [BackgroundKind, ...BackgroundKind[]];

export const MAX_ITEMS = 60;
export const MAX_ITEM_TEXT = 220;
export const MAX_EVIDENCE = 300;
export const MAX_TARGET = 1500;

export type BackgroundItem = {
  id: string;
  kind: BackgroundKind;
  text: string;
  origin: 'stated' | 'inferred';
  /** A line copied from the source document. Checked by the server. */
  evidence: string;
  /** Name of the file or "Pasted text". */
  source: string;
  /** Only confirmed items are ever sent to the live coach. */
  confirmed: boolean;
};

export const extractedItemSchema = z.object({
  kind: z.enum(KIND_IDS),
  text: z.string().trim().min(1).max(MAX_ITEM_TEXT),
  origin: z.enum(['stated', 'inferred']),
  evidence: z.string().trim().min(1).max(MAX_EVIDENCE),
}).strict();
export const extractionSchema = z.object({ items: z.array(extractedItemSchema).max(MAX_ITEMS) }).strict();
export type ExtractedItem = z.infer<typeof extractedItemSchema>;

/** Item shape sent to the live coach: no evidence, no source, nothing the user did not confirm. */
export const liveItemSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(KIND_IDS),
  text: z.string().trim().min(1).max(MAX_ITEM_TEXT),
}).strict();
export type LiveItem = z.infer<typeof liveItemSchema>;

export function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"').replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim();
}

/** True when the quoted evidence really appears in the source (ignoring case, spacing and quote style). */
export function evidenceInSource(evidence: string, source: string) {
  const needle = normalizeForMatch(evidence).replace(/^[-•*·]\s*/, '');
  return needle.length >= 8 && normalizeForMatch(source).includes(needle);
}

const keyOf = (item: Pick<BackgroundItem, 'kind' | 'text'>) => `${item.kind}:${normalizeForMatch(item.text)}`;

/** Turns checked extraction output into editable items. Stated items start confirmed; inferred ones wait for the user. */
export function toBackgroundItems(extracted: ExtractedItem[], source: string, makeId: () => string): BackgroundItem[] {
  return extracted.map(item => ({
    id: makeId(), kind: item.kind, text: item.text, origin: item.origin, evidence: item.evidence, source,
    confirmed: item.origin === 'stated' && item.kind !== 'improve' && item.kind !== 'beware',
  }));
}

/** Adds new items to existing ones, skipping exact duplicates. Conflicting wording from different sources stays side by side. */
export function mergeItems(existing: BackgroundItem[], added: BackgroundItem[]) {
  const seen = new Set(existing.map(keyOf));
  const fresh: BackgroundItem[] = [];
  for (const item of added) {
    if (seen.has(keyOf(item))) continue;
    seen.add(keyOf(item)); fresh.push(item);
  }
  return [...existing, ...fresh].slice(0, MAX_ITEMS);
}

/** What the live coach may see: confirmed items only, and never the personal "basics" section. */
export function liveItems(items: BackgroundItem[]): LiveItem[] {
  return items.filter(item => item.confirmed && item.kind !== 'basics' && item.text.trim()).map(({ id, kind, text }) => ({ id, kind, text: text.trim() }));
}

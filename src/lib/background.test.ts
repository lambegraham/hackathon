import { describe, expect, it } from 'vitest';
import { evidenceInSource, liveItems, mergeItems, normalizeForMatch, toBackgroundItems, type BackgroundItem } from './background';

const SOURCE = "Led a team of 4 volunteers to organise a hackathon with 120 participants (2025).\n- Tutored first-year students in C programming.";
let counter = 0;
const id = () => `i${++counter}`;
const item = (over: Partial<BackgroundItem> = {}): BackgroundItem => ({ id: id(), kind: 'strength', text: 'Leadership', origin: 'stated', evidence: 'Led a team of 4 volunteers', source: 'cv.pdf', confirmed: true, ...over });

describe('evidence checking', () => {
  it('accepts an exact line regardless of case, spacing and quote style', () => {
    expect(evidenceInSource('LED A TEAM of 4   volunteers to organise a hackathon', SOURCE)).toBe(true);
    expect(evidenceInSource("- Tutored first-year students in C programming.", SOURCE)).toBe(true);
    expect(evidenceInSource('Tutored first‑year students', SOURCE)).toBe(true);
  });
  it('rejects invented or too-short evidence', () => {
    expect(evidenceInSource('Managed a team of 40 engineers', SOURCE)).toBe(false);
    expect(evidenceInSource('team', SOURCE)).toBe(false);
    expect(evidenceInSource('', SOURCE)).toBe(false);
  });
  it('normalises curly quotes and dashes', () => {
    expect(normalizeForMatch('It’s “fine” — ok')).toBe('it\'s "fine" - ok');
  });
});

describe('items', () => {
  it('starts stated strengths confirmed, but inferred, improve and beware items unconfirmed', () => {
    const items = toBackgroundItems([
      { kind: 'strength', text: 'Led a team', origin: 'stated', evidence: 'Led a team of 4 volunteers' },
      { kind: 'implicit', text: 'Coordination', origin: 'inferred', evidence: 'organise a hackathon with 120 participants' },
      { kind: 'improve', text: 'Not shown: results', origin: 'stated', evidence: 'Tutored first-year students' },
      { kind: 'beware', text: 'Vague impact', origin: 'stated', evidence: 'Tutored first-year students' },
    ], 'cv.pdf', id);
    expect(items.map(entry => entry.confirmed)).toEqual([true, false, false, false]);
    expect(items.every(entry => entry.source === 'cv.pdf')).toBe(true);
  });

  it('merges without exact duplicates and keeps conflicting wording', () => {
    const a = item({ text: 'Led a team' });
    const merged = mergeItems([a], [item({ text: '  led a TEAM ' }), item({ text: 'Led a team of 5' })]);
    expect(merged.map(entry => entry.text)).toEqual(['Led a team', 'Led a team of 5']);
  });

  it('only exposes confirmed, non-basics items to the live coach, without evidence or source', () => {
    const live = liveItems([item({ text: 'A' }), item({ text: 'B', confirmed: false }), item({ text: 'C', kind: 'basics' }), item({ text: '   ' })]);
    expect(live).toHaveLength(1);
    expect(Object.keys(live[0]).sort()).toEqual(['id', 'kind', 'text']);
  });
});

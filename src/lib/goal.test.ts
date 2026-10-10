import { describe, expect, it } from 'vitest';
import { nextPoint, quoteInAnswer, type GoalPoint } from './goal';

const points: GoalPoint[] = [
  { id: 'p1', label: 'Python and Django', why: '', itemIds: ['a'] },
  { id: 'p2', label: 'Testing and code review', why: '', itemIds: [] },
  { id: 'p3', label: 'Explaining to non-technical people', why: '', itemIds: ['b'] },
];

describe('nextPoint', () => {
  it('prefers uncovered points backed by profile evidence, in order', () => {
    expect(nextPoint(points, {})?.id).toBe('p1');
    expect(nextPoint(points, { p1: 'x' })?.id).toBe('p3');
  });
  it('falls back to a gap, then to null when all are covered', () => {
    expect(nextPoint(points, { p1: 'x', p3: 'y' })?.id).toBe('p2');
    expect(nextPoint(points, { p1: 'x', p2: 'y', p3: 'z' })).toBeNull();
  });
  it('is stable for the same input', () => {
    expect(nextPoint(points, { p1: 'x' })).toBe(nextPoint(points, { p1: 'x' }));
  });
});

describe('quoteInAnswer', () => {
  const answer = 'I built a Django app that 30 music students use to book rooms.';
  it('accepts real quotes, ignoring case, spacing and wrapping punctuation', () => {
    expect(quoteInAnswer('built a Django app', answer)).toBe(true);
    expect(quoteInAnswer('“30 MUSIC   students use”.', answer)).toBe(true);
  });
  it('rejects invented or too-short quotes', () => {
    expect(quoteInAnswer('built a Flask app', answer)).toBe(false);
    expect(quoteInAnswer('Django', answer)).toBe(false);
  });
});

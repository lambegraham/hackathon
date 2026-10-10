import { describe, expect, it } from 'vitest';
import { createCommentGate, fillerNudge, paceNudge, type Sensitivity } from './live-nudges';

describe('filler nudge', () => {
  it('fires on frequent fillers in enough words', () => {
    const nudge = fillerNudge('Um so I think uh we could um maybe start with the budget and then uh move on to the plan');
    expect(nudge?.kind).toBe('filler');
    expect(nudge?.text).toContain('filler');
  });
  it('stays quiet for few fillers, short text or none', () => {
    expect(fillerNudge('Um I built an app that helps people practise hard conversations before they happen in real life')).toBeNull();
    expect(fillerNudge('Um uh um')).toBeNull();
    expect(fillerNudge('I built an app for practice conversations and I led the team that shipped it last spring')).toBeNull();
  });
});

describe('pace nudge', () => {
  const words = (count: number) => Array.from({ length: count }, (_, index) => `w${index}`).join(' ');
  it('fires when speaking fast over enough time', () => { expect(paceNudge(words(40), 10000)?.kind).toBe('pace'); });
  it('stays quiet for normal pace, short samples and early moments', () => {
    expect(paceNudge(words(30), 15000)).toBeNull();
    expect(paceNudge(words(10), 3000)).toBeNull();
    expect(paceNudge(words(40), 5000)).toBeNull();
  });
});

describe('comment gate', () => {
  const gate = (value: Sensitivity) => createCommentGate(() => value);
  it('allows one profile hint per turn and one of each delivery nudge', () => {
    const g = gate('normal');
    expect(g.allow('mention', 0)).toBe(true); g.record('mention', 0);
    expect(g.allow('beware', 1)).toBe(false);
    expect(g.allow('filler', 100)).toBe(false);
    expect(g.allow('filler', 16000)).toBe(true); g.record('filler', 16000);
    expect(g.allow('filler', 40000)).toBe(false);
    g.startTurn();
    expect(g.allow('filler', 40000)).toBe(true);
  });
  it('is silent when off and slower when quiet', () => {
    expect(gate('off').allow('mention', 0)).toBe(false);
    const quiet = gate('quiet');
    expect(quiet.allow('mention', 0)).toBe(true); quiet.record('mention', 0); quiet.startTurn();
    expect(quiet.allow('mention', 1000)).toBe(false);
    expect(quiet.allow('mention', 2000)).toBe(true);
    quiet.record('mention', 2000);
    expect(quiet.allow('pace', 20000)).toBe(false);
    expect(quiet.allow('pace', 43000)).toBe(true);
  });
  it('reads sensitivity live', () => {
    let value: Sensitivity = 'normal';
    const g = createCommentGate(() => value);
    expect(g.allow('mention', 0)).toBe(true);
    value = 'off';
    expect(g.allow('mention', 0)).toBe(false);
  });
});

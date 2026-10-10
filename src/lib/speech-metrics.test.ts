import { describe, expect, it } from 'vitest';
import { speechMetrics } from './speech-metrics';
const voice = (segments: {text:string;startSeconds?:number;endSeconds?:number}[]) => ({role:'user' as const, content:'Display text', speech:{source:'gradium' as const,segments}});
describe('recognised speech metrics', () => {
  it('does not fabricate observations for typed or historical text', () => {
    expect(speechMetrics([{role:'user',content:'Um, like, hello.'}])).toBeNull();
    expect(speechMetrics([{role:'assistant',content:'Um',speech:{source:'gradium',segments:[{text:'Um'}]}}])).toBeNull();
  });
  it('counts explicit fillers separately from possible speech habits and preserves raw text', () => {
    const raw = '  Um, uh... I mean, like, I I built it.\nYou know? Kind of, sort of. Hmm! erm er.';
    const result = speechMetrics([voice([{text:raw}])])!;
    expect(result.fillers).toEqual([{phrase:'um',count:1},{phrase:'uh',count:1},{phrase:'erm',count:1},{phrase:'er',count:1},{phrase:'hmm',count:1}]);
    expect(result.possibleHabits.every(item => item.count === 1)).toBe(true);
    expect(result.fillerCount).toBe(5);
    expect(result.repetitions).toBe(1);
    expect(result.turns[0].segments[0].text).toBe(raw);
    expect(result.gaps).toEqual([]);
    expect(result.timingAvailable).toBe(false);
  });
  it('counts boundary-separated words without treating other words as fillers', () => {
    const result = speechMetrics([voice([{text:'umbrella human thermal early likes alike'},{text:'You'},{text:'know, um um'}])])!;
    expect(result.fillerCount).toBe(2);
    expect(result.possibleHabits.find(item=>item.phrase==='like')?.count).toBe(0);
    expect(result.possibleHabits.find(item=>item.phrase==='you know')?.count).toBe(1);
    expect(result.repetitions).toBe(1);
  });
  it('uses known segment gaps only, without crossing turns or missing timestamps', () => {
    const result = speechMetrics([
      voice([{text:'um',startSeconds:0,endSeconds:0.5},{text:'answer',startSeconds:2,endSeconds:3},{text:'unknown'},{text:'later',startSeconds:8,endSeconds:9}]),
      voice([{text:'new turn',startSeconds:12,endSeconds:13}]),
    ])!;
    expect(result.gaps).toEqual([{messageIndex:0,afterSegment:0,startSeconds:0.5,endSeconds:2,durationSeconds:1.5}]);
    expect(result.timingAvailable).toBe(true);
    expect(result.words).toBe(6);
    expect(result.fillersPer100Words).toBeCloseTo(100/6);
  });
  it('shows a measured gap even when only adjoining boundaries are supplied', () => {
    const result=speechMetrics([voice([{text:'one',endSeconds:1},{text:'two',startSeconds:2}])])!;
    expect(result.gaps[0].durationSeconds).toBe(1);
    expect(result.timingAvailable).toBe(true);
  });
  it('does not turn overlaps or untimed segments into silence', () => {
    const result=speechMetrics([voice([{text:'one',startSeconds:0,endSeconds:2},{text:'two',startSeconds:1,endSeconds:3},{text:'three',startSeconds:3,endSeconds:4}])])!;
    expect(result.gaps).toEqual([]);
    expect(result.timingAvailable).toBe(true);
  });
  it('marks an empty recognised voice turn unavailable for word-rate comparisons', () => {
    const result=speechMetrics([voice([{text:'...'}])])!;
    expect(result.words).toBe(0);
    expect(result.fillersPer100Words).toBeNull();
  });
});

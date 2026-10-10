import type { KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SCENARIOS } from '@/lib/scenarios';
import { OUTFITS, OutfitArt, type OutfitId } from './outfits';

export function Wardrobe({ value, onChange }: { value: OutfitId; onChange: (id: OutfitId) => void }) {
  const index = OUTFITS.findIndex(outfit => outfit.id === value);
  const current = OUTFITS[index];
  const scenario = SCENARIOS.find(item => item.id === value)!;
  const step = (by: number) => onChange(OUTFITS[(index + by + OUTFITS.length) % OUTFITS.length].id);
  function onKey(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = OUTFITS[(index + (event.key === 'ArrowRight' ? 1 : -1) + OUTFITS.length) % OUTFITS.length].id;
    onChange(next);
    requestAnimationFrame(() => document.getElementById(`hanger-${next}`)?.focus());
  }
  return <div className="wardrobe">
    <div className="wardrobe-head"><span className="wardrobe-badge">The wardrobe</span><span className="wardrobe-count">{index + 1} / {OUTFITS.length}</span></div>
    <div className="rail" role="radiogroup" aria-label="Choose an outfit">
      {OUTFITS.map(outfit => {
        const title = SCENARIOS.find(item => item.id === outfit.id)!.title;
        const on = outfit.id === value;
        return <button key={outfit.id} id={`hanger-${outfit.id}`} role="radio" aria-checked={on} tabIndex={on ? 0 : -1} className={`hanger ${on ? 'hanger-on' : ''}`} onClick={() => onChange(outfit.id)} onKeyDown={onKey} aria-label={`${title}: ${outfit.wear}`}>
          <svg className="hanger-hook" viewBox="0 0 60 26" aria-hidden="true"><path d="M30 2a5 5 0 1 1 5 5q-5 0-5 6L4 24h52L30 13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <svg className="hanger-icon" viewBox={outfit.crop} aria-hidden="true"><OutfitArt id={outfit.id} /></svg>
          <span className="hanger-label">{title}</span>
        </button>;
      })}
    </div>
    <div className="wardrobe-pick">
      <button className="wardrobe-arrow" aria-label="Previous outfit" onClick={() => step(-1)}><ChevronLeft size={20} /></button>
      <div className="wardrobe-text" aria-live="polite"><strong>{scenario.title}</strong><span>{current.wear} · {scenario.description}</span></div>
      <button className="wardrobe-arrow" aria-label="Next outfit" onClick={() => step(1)}><ChevronRight size={20} /></button>
    </div>
  </div>;
}

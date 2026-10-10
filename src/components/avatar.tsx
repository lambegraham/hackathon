'use client';

import React, { useEffect, useState } from 'react';
import { GridVisualizer } from './grid-visualizer';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function Avatar({
  state,
  gender = 'male',
  scenario = 'interview',
  difficulty = 'neutral',
  volume: explicitVolume,
}: {
  state: AvatarState;
  gender?: 'male' | 'female';
  scenario?: string;
  difficulty?: 'friendly' | 'neutral' | 'challenging';
  volume?: number;
}) {
  const isFormal = scenario === 'interview' || scenario === 'raise';

  // Dynamic voice modulation (大声变大: simulated speech acoustic cadence)
  const [speechVol, setSpeechVol] = useState(0);

  useEffect(() => {
    if (explicitVolume !== undefined) {
      setSpeechVol(explicitVolume);
      return;
    }

    if (state !== 'speaking') {
      setSpeechVol(0);
      return;
    }

    let animId: number;
    let startTime = performance.now();

    function updateVolume(now: number) {
      const t = (now - startTime) / 1000;
      // Speech cadence: rhythmic harmonic spikes simulating human vocal pulses
      const base = Math.sin(t * 7.5) * 0.35 + Math.sin(t * 13.2) * 0.2 + 0.5;
      const speechVolume = Math.max(0.15, Math.min(1.0, base));
      setSpeechVol(speechVolume);
      animId = requestAnimationFrame(updateVolume);
    }

    animId = requestAnimationFrame(updateVolume);
    return () => cancelAnimationFrame(animId);
  }, [state, explicitVolume]);

  // Color mapping:
  // Neutral: Modern Electric Azure (#0284c7)
  // Friendly: Fresh Emerald (#059669)
  // Challenging: Intense Crimson (#e11d48)
  const dotColor = {
    neutral: '#0284c7',
    friendly: '#059669',
    challenging: '#e11d48',
  }[difficulty] || '#0284c7';

  return (
    <div
      className={`avatar avatar-${state} avatar-${gender} avatar-mood-${difficulty} avatar-${isFormal ? 'formal' : 'chill'}`}
      aria-hidden="true"
    >
      <div className="grid-avatar-stage">
        {/* Subtle dot matrix visualizer - pure dots, zero dark background */}
        <GridVisualizer
          state={state}
          color={dotColor}
          volume={speechVol}
          size={250}
        />
      </div>
    </div>
  );
}

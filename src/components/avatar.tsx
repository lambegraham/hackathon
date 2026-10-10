'use client';

import React, { useEffect, useState } from 'react';
import { LiveKitAuraVisualizer } from './aura-visualizer';

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

  // Dynamic voice modulation (大声变大模拟与自然声学起伏)
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
      // Natural speech-like cadence: harmonic waves + periodic peaks
      const base = Math.sin(t * 7.5) * 0.35 + Math.sin(t * 13.2) * 0.2 + 0.45;
      const speechVolume = Math.max(0.1, Math.min(1.0, base));
      setSpeechVol(speechVolume);
      animId = requestAnimationFrame(updateVolume);
    }

    animId = requestAnimationFrame(updateVolume);
    return () => cancelAnimationFrame(animId);
  }, [state, explicitVolume]);

  // Color & Hue mapping for emotions/difficulties:
  // Neutral: Electric Azure / Cyan (#1FD5F9) - matches user reference
  // Friendly: Vivid Emerald Lake (#10B981) - joyful / calm
  // Challenging: Intense Crimson Flame (#F43F5E) - angry / aggressive pushback
  const moodConfig = {
    neutral: {
      color: '#1FD5F9',
      colorShift: 0.08,
    },
    friendly: {
      color: '#10B981',
      colorShift: 0.16,
    },
    challenging: {
      color: '#F43F5E',
      colorShift: 0.22,
    },
  }[difficulty] || {
    color: '#1FD5F9',
    colorShift: 0.08,
  };

  return (
    <div
      className={`avatar avatar-${state} avatar-${gender} avatar-mood-${difficulty} avatar-${isFormal ? 'formal' : 'chill'}`}
      aria-hidden="true"
    >
      <div className="aura-stage-wrapper">
        {/* Soft atmospheric ambient bloom */}
        <div className={`aura-glow-backdrop mood-${difficulty} state-${state}`} />

        {/* LiveKit Agents UI Aura Visualizer */}
        <LiveKitAuraVisualizer
          state={state}
          color={moodConfig.color}
          colorShift={moodConfig.colorShift}
          volume={speechVol}
          size={270}
          themeMode="dark"
          className="aura-visualizer-canvas"
        />

        {/* Outer dynamic acoustic resonance ring */}
        <div className={`aura-resonance-ring mood-${difficulty} state-${state}`} />
      </div>
    </div>
  );
}

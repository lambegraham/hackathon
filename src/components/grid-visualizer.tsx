'use client';

/**
 * Grid Audio Visualizer
 * A clean, retro lo-fi dot-matrix visualizer inspired by LiveKit Agents UI.
 * Pure floating dots on transparent background (zero dark container / zero black circle).
 */

import React, { useEffect, useRef } from 'react';

export type GridState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface GridVisualizerProps {
  state?: GridState;
  color?: string; // Hex color e.g. '#0284c7'
  volume?: number; // 0.0 ~ 1.0 (大声变大)
  size?: number; // px width & height
  className?: string;
}

const DEFAULT_COLOR = '#0284c7';

function hexToRgb(hexColor: string): [number, number, number] {
  const match = hexColor.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (match) {
    return [
      parseInt(match[1], 16),
      parseInt(match[2], 16),
      parseInt(match[3], 16),
    ];
  }
  return [2, 132, 199]; // #0284c7
}

export function GridVisualizer({
  state = 'idle',
  color = DEFAULT_COLOR,
  volume = 0,
  size = 260,
  className = '',
}: GridVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const colorRef = useRef(color);
  colorRef.current = color;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let startTime = performance.now();
    let smoothedVol = 0;

    // Grid configuration: 9x9 matrix
    const COLS = 9;
    const ROWS = 9;
    const CENTER_C = 4;
    const CENTER_R = 4;

    function render(now: number) {
      if (!ctx || !canvas) return;
      const t = (now - startTime) / 1000;
      const targetVol = volumeRef.current;
      smoothedVol += (targetVol - smoothedVol) * 0.15; // Smooth audio volume response

      const currentState = stateRef.current;
      const [r, g, b] = hexToRgb(colorRef.current);

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Grid dimensions and spacing
      const pad = 24;
      const availableSize = Math.min(width, height) - pad * 2;
      const spacing = availableSize / (COLS - 1);
      const startX = (width - (COLS - 1) * spacing) / 2;
      const startY = (height - (ROWS - 1) * spacing) / 2;

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const x = startX + col * spacing;
          const y = startY + row * spacing;
          const distFromCenter = Math.hypot(col - CENTER_C, row - CENTER_R);

          let intensity = 0.22; // Base dot opacity on light canvas
          let dotRadius = 3.6;

          switch (currentState) {
            case 'idle': {
              // Gentle radial breathing ripple
              const wave = Math.sin(t * 2.8 - distFromCenter * 0.75);
              const crest = Math.max(0, wave);
              intensity = 0.2 + crest * 0.55;
              dotRadius = 3.5 + crest * 2.0;
              break;
            }

            case 'listening': {
              // Expansive radar rings
              const wave = Math.sin(t * 4.8 - distFromCenter * 0.95);
              const isPeak = Math.max(0, wave);
              intensity = 0.22 + isPeak * 0.78;
              dotRadius = 3.5 + isPeak * 2.8;
              break;
            }

            case 'thinking': {
              // Rotating orbital chase
              const angle = Math.atan2(row - CENTER_R, col - CENTER_C);
              const spin = Math.sin(angle * 2.0 - t * 4.5 + distFromCenter * 0.65);
              const isOrbit = Math.max(0, spin);
              intensity = 0.2 + isOrbit * 0.75;
              dotRadius = 3.5 + isOrbit * 2.6;
              break;
            }

            case 'speaking': {
              // 大声变大: audio amplitude equalizer & concentric energetic surge
              const volEnergy = Math.max(0.18, smoothedVol);
              const radiusThreshold = 0.6 + volEnergy * 4.6;
              const inRadius = distFromCenter <= radiusThreshold;

              // Sound band modulation per column
              const colWave = Math.sin(t * 14.0 + col * 1.1) * 0.5 + 0.5;
              const rowDist = Math.abs(row - CENTER_R);
              const eqHighlight = (volEnergy * 4.5 * colWave) >= rowDist;

              if (inRadius || eqHighlight) {
                const centerProximity = 1.0 - (distFromCenter / 5.7);
                intensity = Math.min(1.0, 0.45 + volEnergy * 0.55 + centerProximity * 0.2);
                dotRadius = 3.8 + volEnergy * 4.0 * (0.65 + centerProximity * 0.35);
              } else {
                intensity = 0.2;
                dotRadius = 3.4;
              }
              break;
            }
          }

          // Draw the matrix dot with smooth anti-aliasing
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);

          if (intensity > 0.42) {
            // Glowing illuminated state
            ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${Math.min(0.9, intensity * 0.85)})`;
            ctx.shadowBlur = 10;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${intensity})`;
          } else {
            // Subtle baseline dot
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${intensity})`;
          }

          ctx.fill();
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    }

    // Set pixel ratio resolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [size]);

  return (
    <div
      className={`grid-visualizer-container relative flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="block pointer-events-none"
      />
    </div>
  );
}

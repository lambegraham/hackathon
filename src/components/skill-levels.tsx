'use client';

import { useLayoutEffect, useRef } from 'react';
import { COACHING_METRICS, type SavedSession } from '@/lib/profile';
import { skillLevelLabel } from '@/lib/practice-level';

const MOTION_MS = 560;

function trackPercent(score: number): number {
  return ((score - 1) / 4) * 100;
}

function SkillLevelRow({ label, score, previousScore }: {
  label: string;
  score: number;
  previousScore?: number;
}) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const hasPrevious = previousScore !== undefined;

  useLayoutEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const place = (value: number) => {
      marker.style.left = `${trackPercent(value)}%`;
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      place(score);
    };
    const onChange = () => {
      if (media.matches) stop();
    };
    media.addEventListener('change', onChange);
    const origin = previousScore;
    if (origin === undefined || origin === score || media.matches) {
      place(score);
      return () => {
        cancelAnimationFrame(frame);
        media.removeEventListener('change', onChange);
      };
    }
    const started = performance.now();
    place(origin);
    const step = (now: number) => {
      if (media.matches) {
        stop();
        return;
      }
      const progress = Math.min(1, (now - started) / MOTION_MS);
      const eased = 1 - (1 - progress) * (1 - progress);
      place(origin + (score - origin) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('change', onChange);
    };
  }, [score, previousScore]);

  return (
    <div className="skill-level-row">
      <div className="skill-level-heading">
        <strong>{label}</strong>
        <span>{skillLevelLabel(score)}</span>
      </div>
      <div className="skill-track" aria-hidden="true">
        <div className="skill-track-inner">
          <span className="skill-track-line" />
          {[1, 2, 3, 4, 5].map(step => (
            <span key={step} className="skill-tick" style={{ left: `${trackPercent(step)}%` }}>
              <span className="skill-tick-label">{step}</span>
            </span>
          ))}
          <span
            ref={markerRef}
            className={hasPrevious ? 'skill-marker' : 'skill-marker settle'}
            style={{ left: `${trackPercent(score)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function SkillLevels({ session, previous }: { session: SavedSession; previous?: SavedSession }) {
  const assessment = session.report.assessment;
  if (!assessment) return null;
  const prior = previous?.report.assessment;
  return (
    <div className="skill-levels">
      {COACHING_METRICS.map(({ key, label }) => (
        <SkillLevelRow
          key={key}
          label={label}
          score={assessment[key].score}
          previousScore={prior?.[key].score}
        />
      ))}
    </div>
  );
}

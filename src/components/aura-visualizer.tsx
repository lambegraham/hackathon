'use client';

/**
 * LiveKit Agents UI - Audio Visualizer Aura
 * Powered by WebGL Fragment Shader developed in partnership with Unicorn Studio.
 * Based on @livekit/agent-audio-visualizer-aura (https://livekit.com/products/agents-ui)
 */

import React, { useEffect, useRef, useMemo } from 'react';

export type AuraState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface AuraVisualizerProps {
  state?: AuraState;
  color?: string; // Hex color e.g. '#1FD5F9'
  colorShift?: number; // 0.0 ~ 1.0
  volume?: number; // 0.0 ~ 1.0 (大声变大)
  themeMode?: 'dark' | 'light';
  size?: number; // width & height in px
  className?: string;
}

const DEFAULT_COLOR = '#1FD5F9';

function hexToRgb(hexColor: string): [number, number, number] {
  try {
    const match = hexColor.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
    if (match) {
      return [
        parseInt(match[1], 16) / 255,
        parseInt(match[2], 16) / 255,
        parseInt(match[3], 16) / 255,
      ];
    }
  } catch {
    // fallback
  }
  return [0.12, 0.83, 0.98]; // #1FD5F9
}

// LiveKit x Unicorn Studio custom GLSL Fragment Shader
const FRAGMENT_SHADER = `
precision highp float;

uniform float iTime;
uniform vec2 iResolution;
uniform float uSpeed;
uniform float uBlur;
uniform float uScale;
uniform float uShape;
uniform float uFrequency;
uniform float uAmplitude;
uniform float uBloom;
uniform float uMix;
uniform float uSpacing;
uniform float uColorShift;
uniform float uVariance;
uniform float uSmoothing;
uniform float uMode;
uniform vec3 uColor;

const float TAU = 6.283185;

vec2 randFibo(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.xx + p.yx) * p.xy);
}

vec3 Tonemap(vec3 x) {
  x *= 4.0;
  return x / (1.0 + x);
}

float luma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float sdCircle(vec2 st, float r) {
  return length(st) - r;
}

float getSdf(vec2 st) {
  return sdCircle(st, uScale);
}

vec2 turb(vec2 pos, float t, float it) {
  mat2 rotation = mat2(0.6, -0.25, 0.25, 0.9);
  mat2 layerRotation = mat2(0.6, -0.8, 0.8, 0.6);

  float frequency = mix(2.0, 15.0, uFrequency);
  float amplitude = uAmplitude;
  float frequencyGrowth = 1.4;
  float animTime = t * 0.1 * uSpeed;

  const int LAYERS = 4;
  for(int i = 0; i < LAYERS; i++) {
    vec2 rotatedPos = pos * rotation;
    vec2 wave = sin(frequency * rotatedPos + float(i) * animTime + it);
    pos += (amplitude / frequency) * rotation[0] * wave;
    rotation *= layerRotation;
    amplitude *= mix(1.0, max(wave.x, wave.y), uVariance);
    frequency *= frequencyGrowth;
  }
  return pos;
}

const float ITERATIONS = 20.0;

void main(void) {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec3 pp = vec3(0.0);
  vec3 bloom = vec3(0.0);
  float t = iTime * 0.5;
  vec2 pos = uv - 0.5;

  vec2 prevPos = turb(pos, t, 0.0 - 1.0 / ITERATIONS);
  float spacing = mix(1.0, TAU, uSpacing);

  for(float i = 1.0; i < ITERATIONS + 1.0; i++) {
    float iter = i / ITERATIONS;
    vec2 st = turb(pos, t, iter * spacing);
    float d = abs(getSdf(st));
    float pd = distance(st, prevPos);
    prevPos = st;
    float dynamicBlur = exp2(pd * 2.0 * 1.4426950408889634) - 1.0;
    float ds = smoothstep(0.0, uBlur * 0.05 + max(dynamicBlur * uSmoothing, 0.001), d);

    vec3 layerColor = uColor;
    if(uColorShift > 0.01) {
      vec3 hsv = rgb2hsv(layerColor);
      hsv.x = fract(hsv.x + (1.0 - iter) * uColorShift * 0.3);
      layerColor = hsv2rgb(hsv);
    }

    float invd = 1.0 / max(d + dynamicBlur, 0.001);
    pp += (ds - 1.0) * layerColor;
    bloom += clamp(invd, 0.0, 250.0) * layerColor;
  }

  pp *= 1.0 / ITERATIONS;
  vec3 outColor;

  if(uMode < 0.5) {
    bloom = bloom / (bloom + 2e4);
    outColor = (-pp + bloom * 3.0 * uBloom) * 1.2;
    outColor += (randFibo(gl_FragCoord.xy).x - 0.5) / 255.0;
    outColor = Tonemap(outColor);
    float alpha = luma(outColor) * uMix;
    gl_FragColor = vec4(outColor * uMix, alpha);
  } else {
    outColor = -pp;
    outColor += (randFibo(gl_FragCoord.xy).x - 0.5) / 255.0;
    float brightness = length(outColor);
    vec3 direction = brightness > 0.0 ? outColor / brightness : outColor;
    float factor = 2.0;
    float mappedBrightness = (brightness * factor) / (1.0 + brightness * factor);
    outColor = direction * mappedBrightness;
    float gray = dot(outColor, vec3(0.2, 0.5, 0.1));
    float saturationBoost = 3.0;
    outColor = mix(vec3(gray), outColor, saturationBoost);
    outColor = clamp(outColor, 0.0, 1.0);
    float alpha = mappedBrightness * clamp(uMix, 1.0, 2.0);
    gl_FragColor = vec4(outColor, alpha);
  }
}
`;

const VERTEX_SHADER = `
attribute vec3 aVertexPosition;
void main(void) {
  gl_Position = vec4(aVertexPosition, 1.0);
}
`;

export function LiveKitAuraVisualizer({
  state = 'idle',
  color = DEFAULT_COLOR,
  colorShift = 0.08,
  volume = 0,
  themeMode = 'dark',
  size = 280,
  className = '',
}: AuraVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rgbColor = useMemo(() => hexToRgb(color), [color]);

  // Target dynamics based on LiveKit state & audio volume
  const dynamics = useMemo(() => {
    switch (state) {
      case 'idle':
        return {
          speed: 8.0,
          scale: 0.19,
          amplitude: 1.1,
          frequency: 0.45,
          brightness: 1.3,
        };
      case 'listening':
        return {
          speed: 15.0,
          scale: 0.23,
          amplitude: 0.9,
          frequency: 0.7,
          brightness: 1.8,
        };
      case 'thinking':
        return {
          speed: 28.0,
          scale: 0.21,
          amplitude: 0.5,
          frequency: 1.1,
          brightness: 1.6,
        };
      case 'speaking': {
        // 大声变大: volume 0~1 scales radius and energetic frequency
        const clampedVol = Math.max(0, Math.min(1, volume));
        return {
          speed: 40.0 + clampedVol * 25.0,
          scale: 0.23 + clampedVol * 0.13, // 音量增大时能量光圈显著膨胀
          amplitude: 0.75 + clampedVol * 0.4,
          frequency: 1.2 + clampedVol * 0.5,
          brightness: 1.6 + clampedVol * 0.5,
        };
      }
    }
  }, [state, volume]);

  const dynamicsRef = useRef(dynamics);
  dynamicsRef.current = dynamics;

  const currentPropsRef = useRef({
    themeMode,
    colorShift,
    rgbColor,
  });
  currentPropsRef.current = { themeMode, colorShift, rgbColor };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      (canvas.getContext('webgl', { alpha: true, antialias: true }) ||
        canvas.getContext('experimental-webgl', {
          alpha: true,
          antialias: true,
        })) as WebGLRenderingContext | null;

    if (!gl) return; // Fallback for environments without WebGL (e.g. tests)

    // Compile helper
    function compileShader(type: number, src: string) {
      if (!gl) return null;
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('Shader compile error:', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Program link error:', gl.getProgramInfoLog(program));
      return;
    }

    // Quad buffer
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const vertices = new Float32Array([
      1.0, 1.0, 0.0,
      -1.0, 1.0, 0.0,
      1.0, -1.0, 0.0,
      -1.0, -1.0, 0.0,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Uniform locations
    const locTime = gl.getUniformLocation(program, 'iTime');
    const locRes = gl.getUniformLocation(program, 'iResolution');
    const locSpeed = gl.getUniformLocation(program, 'uSpeed');
    const locBlur = gl.getUniformLocation(program, 'uBlur');
    const locScale = gl.getUniformLocation(program, 'uScale');
    const locShape = gl.getUniformLocation(program, 'uShape');
    const locFreq = gl.getUniformLocation(program, 'uFrequency');
    const locAmp = gl.getUniformLocation(program, 'uAmplitude');
    const locBloom = gl.getUniformLocation(program, 'uBloom');
    const locMix = gl.getUniformLocation(program, 'uMix');
    const locSpacing = gl.getUniformLocation(program, 'uSpacing');
    const locColorShift = gl.getUniformLocation(program, 'uColorShift');
    const locVariance = gl.getUniformLocation(program, 'uVariance');
    const locSmoothing = gl.getUniformLocation(program, 'uSmoothing');
    const locMode = gl.getUniformLocation(program, 'uMode');
    const locColor = gl.getUniformLocation(program, 'uColor');
    const aPos = gl.getAttribLocation(program, 'aVertexPosition');

    let animId: number;
    let startTime = performance.now();
    let currentScale = dynamicsRef.current.scale;
    let currentSpeed = dynamicsRef.current.speed;
    let currentAmp = dynamicsRef.current.amplitude;
    let currentFreq = dynamicsRef.current.frequency;
    let currentBright = dynamicsRef.current.brightness;

    function render(now: number) {
      try {
        if (!gl || !canvas) return;
        const elapsed = (now - startTime) / 1000;

        // Smooth lerp towards target dynamics
        const target = dynamicsRef.current;
        const lerpFactor = 0.08;
        currentScale += (target.scale - currentScale) * lerpFactor;
        currentSpeed += (target.speed - currentSpeed) * lerpFactor;
        currentAmp += (target.amplitude - currentAmp) * lerpFactor;
        currentFreq += (target.frequency - currentFreq) * lerpFactor;
        currentBright += (target.brightness - currentBright) * lerpFactor;

        const { themeMode, colorShift, rgbColor } = currentPropsRef.current;

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

        gl.uniform1f(locTime, elapsed);
        gl.uniform2f(locRes, canvas.width, canvas.height);
        gl.uniform1f(locSpeed, currentSpeed);
        gl.uniform1f(locBlur, 0.2);
        gl.uniform1f(locScale, currentScale);
        gl.uniform1f(locShape, 1.0);
        gl.uniform1f(locFreq, currentFreq);
        gl.uniform1f(locAmp, currentAmp);
        gl.uniform1f(locBloom, 0.0);
        gl.uniform1f(locMix, currentBright);
        gl.uniform1f(locSpacing, 0.5);
        gl.uniform1f(locColorShift, colorShift);
        gl.uniform1f(locVariance, 0.1);
        gl.uniform1f(locSmoothing, 1.0);
        gl.uniform1f(locMode, themeMode === 'light' ? 1.0 : 0.0);
        gl.uniform3f(locColor, rgbColor[0], rgbColor[1], rgbColor[2]);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (typeof window !== 'undefined') {
          (window as any).__aura_frames = ((window as any).__aura_frames || 0) + 1;
        }

        animId = requestAnimationFrame(render);
      } catch (err) {
        console.error('Render RAF error:', err);
      }
    }

    animId = requestAnimationFrame(render);

    return () => {
      if (typeof window !== 'undefined') {
        console.log('CLEANUP CALLED at frame:', (window as any).__aura_frames);
      }
      cancelAnimationFrame(animId);
      if (gl) {
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.deleteBuffer(buf);
      }
    };
  }, []);

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="block"
      />
    </div>
  );
}

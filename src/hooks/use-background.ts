'use client';

import { useCallback, useMemo, useState } from 'react';
import { liveItems, mergeItems, MAX_TARGET, toBackgroundItems, type BackgroundItem, type BackgroundKind, type ExtractedItem } from '@/lib/background';
import type { Sensitivity } from '@/lib/live-nudges';

const TYPES: Record<string, string> = { pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown' };
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UNSUPPORTED_MESSAGE = 'Use a PDF, .txt or .md file. Export LinkedIn, Notion or Word pages as PDF first.';

async function errorText(response: Response) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : 'Could not read that document. Try again.';
}

/** Everything the user gives the coach before the conversation. Held in page memory only. */
export function useBackground() {
  const [items, setItems] = useState<BackgroundItem[]>([]);
  const [target, setTargetState] = useState('');
  const [sensitivity, setSensitivity] = useState<Sensitivity>('normal');
  const [includePersonal, setIncludePersonal] = useState(false);
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const addSource = useCallback(async (name: string, type: string, body: BodyInit) => {
    const response = await fetch(`/api/background${includePersonal ? '?personal=1' : ''}`, { method: 'POST', headers: { 'Content-Type': type }, body });
    if (!response.ok) throw new Error(await errorText(response));
    const result: { items: ExtractedItem[]; dropped?: number } = await response.json();
    const added = toBackgroundItems(result.items, name, () => crypto.randomUUID());
    setItems(current => mergeItems(current, added));
    return { count: added.length, dropped: result.dropped ?? 0 };
  }, [includePersonal]);

  const addFiles = useCallback(async (files: File[]) => {
    setNotice(null); setReading(true);
    const messages: string[] = []; let failed = false;
    try {
      for (const file of files) {
        const type = TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''];
        if (!type) { failed = true; messages.push(`${file.name}: ${UNSUPPORTED_MESSAGE}`); continue; }
        if (file.size > MAX_UPLOAD_BYTES) { failed = true; messages.push(`${file.name}: over 5 MB.`); continue; }
        try {
          const { count, dropped } = await addSource(file.name, type, file);
          messages.push(`${file.name}: ${count} items${dropped ? ` (${dropped} unverifiable lines left out)` : ''}.`);
        } catch (cause) { failed = true; messages.push(`${file.name}: ${cause instanceof Error ? cause.message : 'Could not read it.'}`); }
      }
    } finally { setReading(false); setNotice({ tone: failed ? 'error' : 'ok', text: messages.join(' ') }); }
  }, [addSource]);

  const addText = useCallback(async (text: string) => {
    if (text.trim().length < 40) { setNotice({ tone: 'error', text: 'Paste a little more text (at least a few lines).' }); return false; }
    setNotice(null); setReading(true);
    try {
      const { count, dropped } = await addSource('Pasted text', 'text/plain', text);
      setNotice({ tone: 'ok', text: `Pasted text: ${count} items${dropped ? ` (${dropped} unverifiable lines left out)` : ''}.` });
      return true;
    } catch (cause) { setNotice({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not read that text.' }); return false; }
    finally { setReading(false); }
  }, [addSource]);

  const updateItem = useCallback((id: string, patch: Partial<Pick<BackgroundItem, 'text' | 'confirmed'>>) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item)), []);
  const removeItem = useCallback((id: string) => setItems(current => current.filter(item => item.id !== id)), []);
  const addOwn = useCallback((kind: BackgroundKind, text: string) => {
    const clean = text.trim().slice(0, 220);
    if (clean) setItems(current => mergeItems(current, [{ id: crypto.randomUUID(), kind, text: clean, origin: 'stated', evidence: '', source: 'You', confirmed: true }]));
  }, []);
  const clearAll = useCallback(() => { setItems([]); setNotice(null); }, []);
  const setTarget = useCallback((value: string) => setTargetState(value.slice(0, MAX_TARGET)), []);
  const live = useMemo(() => liveItems(items), [items]);

  return { items, live, target, setTarget, sensitivity, setSensitivity, includePersonal, setIncludePersonal, reading, notice, addFiles, addText, updateItem, removeItem, addOwn, clearAll };
}
export type BackgroundState = ReturnType<typeof useBackground>;

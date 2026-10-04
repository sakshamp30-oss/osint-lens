'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageUp, Loader2, Square } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { parsePartial } from '@/lib/partialJson';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import ResultPanel from './ResultPanel';
import { formatBytes, cn } from '@/lib/utils';
import type { AnalysisResult, ForensicsMeta, Mode, StreamEvent } from '@/types';

const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? '14');
const DIRECT_LIMIT = 4 * 1024 * 1024; // Vercel request-body cap is 4.5 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const MODE_INFO: { id: Mode; label: string; hint: string }[] = [
  { id: 'reverse', label: 'Reverse image', hint: 'Description, origin, OCR, landmarks, logos and ready-to-run search queries.' },
  { id: 'geo', label: 'Geolocation', hint: 'Visual clues → reasoning chain → estimated coordinates with confidence.' },
  { id: 'face', label: 'Face / people', hint: 'Describes visible attributes only. It never identifies anyone.' },
  { id: 'forensics', label: 'Forensics', hint: 'EXIF, error-level analysis, C2PA detection and an AI-written assessment.' },
];

class ApiErr extends Error {
  constructor(public code: string, message: string, public resetAt?: number) {
    super(message);
  }
}
function apiErrFrom(j: unknown, status: number): ApiErr {
  const e = (j as { error?: { code?: string; message?: string; resetAt?: number } } | null)?.error;
  return new ApiErr(e?.code ?? 'internal', e?.message ?? `Request failed (HTTP ${status})`, e?.resetAt);
}

async function readNdjson(body: ReadableStream<Uint8Array>, onEvent: (e: StreamEvent) => void) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as StreamEvent);
    }
  }
}

export default function SearchWorkbench() {
  const supabase = useMemo(() => createClient(), []);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('reverse');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [raw, setRaw] = useState('');
  const [partial, setPartial] = useState<AnalysisResult | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [meta, setMeta] = useState<ForensicsMeta | null>(null);
  const [info, setInfo] = useState<{ cached: boolean; model: string; phash: string; w: number; h: number } | null>(null);
  const [error, setError] = useState<{ code: string; message: string; resetAt?: number } | null>(null);
  const [hot, setHot] = useState(false);
  const rawRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback((f: File | null | undefined) => {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) {
      setError({ code: 'unsupported_format', message: 'Unsupported format. Use JPEG, PNG or WebP.' });
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError({ code: 'image_too_large', message: `Image is ${formatBytes(f.size)}; the limit is ${MAX_MB} MB.` });
      return;
    }
    setError(null);
    setFile(f);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }, []);

  // paste from clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) pickFile(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pickFile]);

  const handleEvent = useCallback((ev: StreamEvent) => {
    switch (ev.type) {
      case 'start':
        setInfo({ cached: ev.cached, model: ev.model, phash: ev.phash, w: ev.width, h: ev.height });
        setStatus(ev.cached ? 'Cache hit: no API call used' : 'Streaming from Gemini…');
        break;
      case 'meta':
        setMeta(ev.forensics);
        break;
      case 'chunk':
        rawRef.current += ev.text;
        setRaw(rawRef.current);
        setPartial(parsePartial<AnalysisResult>(rawRef.current));
        break;
      case 'done':
        setResult(ev.result);
        setStatus('Done');
        break;
      case 'error':
        setError({ code: ev.code, message: ev.message, resetAt: ev.resetAt });
        setStatus('');
        break;
    }
  }, []);

  async function run() {
    if (!file) return;
    setError(null); setRaw(''); rawRef.current = ''; setPartial(null); setResult(null); setMeta(null); setInfo(null);
    setRunning(true);
    setStatus('Preparing…');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const form = new FormData();
      form.set('mode', mode);
      if (file.size > DIRECT_LIMIT) {
        setStatus('Uploading full-resolution image…');
        const r = await fetch('/api/upload-url', { method: 'POST', signal: ac.signal });
        const j: unknown = await r.json();
        if (!r.ok) throw apiErrFrom(j, r.status);
        const { path, token } = j as { path: string; token: string };
        const { error: upErr } = await supabase.storage.from('uploads').uploadToSignedUrl(path, token, file, { contentType: file.type });
        if (upErr) throw new ApiErr('upload_failed', `Upload failed: ${upErr.message}`);
        form.set('storagePath', path);
      } else {
        form.set('image', file);
      }
      setStatus('Analyzing…');
      const res = await fetch('/api/search', { method: 'POST', body: form, signal: ac.signal });
      if (!res.ok || !res.body) throw apiErrFrom(await res.json().catch(() => null), res.status);
      await readNdjson(res.body, handleEvent);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setStatus('Aborted');
      else if (e instanceof ApiErr) setError({ code: e.code, message: e.message, resetAt: e.resetAt });
      else setError({ code: 'internal', message: 'Something went wrong. Check your connection and retry.' });
    } finally {
      setRunning(false);
      abortRef.current = null;
      window.dispatchEvent(new Event('usage:refresh'));
    }
  }

  function clearAll() {
    abortRef.current?.abort();
    setFile(null); setError(null); setRaw(''); rawRef.current = ''; setPartial(null); setResult(null); setMeta(null); setInfo(null); setStatus('');
    setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
  }

  const data = result ?? partial;
  const showResults = !!(data || raw || meta);

  return (
    <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Panel title="01 · Input buffer" hint="drop · paste · click">
          <label
            htmlFor="file"
            onDragOver={(e) => { e.preventDefault(); setHot(true); }}
            onDragLeave={() => setHot(false)}
            onDrop={(e) => { e.preventDefault(); setHot(false); pickFile(e.dataTransfer.files[0]); }}
            className={cn(
              'flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-amber-dim p-4 text-center transition',
              hot && 'border-amber bg-amber/10',
            )}
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Selected image preview" className="max-h-72 w-full object-contain" />
            ) : (
              <>
                <ImageUp size={34} />
                <span className="text-[11px] uppercase tracking-[0.2em] text-amber-bright">Drop image · Ctrl+V · click</span>
                <span className="text-[11px] text-amber-dim">JPEG / PNG / WebP · up to {MAX_MB} MB · sent at full resolution</span>
              </>
            )}
          </label>
          <input ref={inputRef} id="file" type="file" accept={ALLOWED.join(',')} hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          {file ? <p className="mt-2 text-[11px] text-amber-dim">{file.name} · {formatBytes(file.size)}</p> : null}
        </Panel>

        <Panel title="02 · Mode">
          <div className="grid grid-cols-2 gap-2">
            {MODE_INFO.map((m) => (
              <button
                key={m.id} type="button" onClick={() => setMode(m.id)} disabled={running}
                className={cn('border px-2 py-2 text-[11px] uppercase tracking-widest transition',
                  mode === m.id ? 'border-amber bg-amber text-black' : 'border-amber-dim text-amber-bright hover:border-amber')}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-amber-dim">{MODE_INFO.find((m) => m.id === mode)?.hint}</p>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" className="flex-1" disabled={!file || running} onClick={run}>
              {running ? <Loader2 size={14} className="animate-spin" /> : null} Execute scan
            </Button>
            {running ? <Button variant="danger" onClick={() => abortRef.current?.abort()}><Square size={12} /> Abort</Button> : null}
            <Button onClick={clearAll}>Clear</Button>
          </div>
          <p className="mt-3 border-t border-amber-dim/50 pt-2 text-[11px] text-amber-dim">
            Your Gemini key is used only for your own searches. Face mode describes appearance and never identifies people.
          </p>
        </Panel>
      </div>

      <Panel
        title="03 · Results"
        hint={info ? `${info.model} · ${info.w}×${info.h}${info.cached ? ' · cached' : ''}` : status || 'awaiting input'}
      >
        {status && !error ? <p className="mb-3 text-[11px] uppercase tracking-widest text-amber-dim">{status}</p> : null}
        {error ? (
          <div className="mb-4 border border-bad/70 bg-bad/5 p-3 text-bad" role="alert">
            <div className="text-[10px] uppercase tracking-[0.2em]">{error.code.replace(/_/g, ' ')}</div>
            <div>{error.message}</div>
            {error.code === 'invalid_key' || error.code === 'no_key' ? (
              <a className="mt-1 inline-block underline" href="/connect">Reconnect your Gemini key →</a>
            ) : null}
            {error.resetAt ? <div className="mt-1 text-[11px]">Resets at {new Date(error.resetAt).toLocaleTimeString()}.</div> : null}
          </div>
        ) : null}
        {showResults ? (
          <ResultPanel data={data} raw={raw} meta={meta} streaming={running} mode={mode} />
        ) : (
          <p className="text-amber-dim">// NO DATA: load an image and execute a scan</p>
        )}
      </Panel>
    </div>
  );
}

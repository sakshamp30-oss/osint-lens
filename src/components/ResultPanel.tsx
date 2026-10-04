'use client';
import { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import QuickSearch from './QuickSearch';
import { googleMapsUrl, osmUrl } from '@/lib/searchLinks';
import type { AnalysisResult, Claim, ForensicsMeta, Mode, SuggestedQuery } from '@/types';

/* ───────── helpers (defensive: partial streams may hold half-built objects) ───────── */
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]).filter((x) => x && typeof x === 'object') : [];
}
function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
const pct = (c: unknown) => (typeof c === 'number' ? `${Math.round(c * 100)}%` : '—');

const BASIS_STYLE: Record<string, string> = {
  observed: 'border-ok text-ok',
  inferred: 'border-cyanx text-cyanx',
  speculated: 'border-bad text-bad',
};
function BasisTag({ basis }: { basis?: string }) {
  if (!basis) return null;
  return <span className={`chip ${BASIS_STYLE[basis] ?? ''}`}>{basis}</span>;
}
function Conf({ c }: { c?: number }) {
  const w = typeof c === 'number' ? Math.max(0, Math.min(1, c)) * 100 : 0;
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-amber-dim">
      <span className="inline-block h-1.5 w-16 border border-amber-dim">
        <span className="block h-full bg-amber" style={{ width: `${w}%` }} />
      </span>
      {pct(c)}
    </span>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-[10px] uppercase tracking-[0.24em] text-amber-dim">{title}</h3>
      {children}
    </div>
  );
}
function ClaimRow({ c, label }: { c: Partial<Claim> | undefined; label?: string }) {
  if (!c || typeof c.text !== 'string') return null;
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      {label ? <span className="w-24 shrink-0 text-[11px] uppercase text-amber-dim">{label}</span> : null}
      <span className="text-amber-bright">{c.text}</span>
      <BasisTag basis={c.basis} />
      <Conf c={c.confidence} />
    </div>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-amber-dim">// {children}</p>;

/* ───────── tabs ───────── */
function SummaryTab({ d }: { d: AnalysisResult }) {
  const people = arr<NonNullable<AnalysisResult['people']>[number]>(d.people);
  return (
    <>
      {d.summary ? <Section title="Summary"><p className="text-amber-bright">{d.summary}</p></Section> : null}
      {d.detailed_description ? <Section title="Description"><p className="whitespace-pre-wrap">{d.detailed_description}</p></Section> : null}
      {arr<Claim>(d.key_observations).length > 0 ? (
        <Section title="Key observations">{arr<Claim>(d.key_observations).map((c, i) => <ClaimRow key={i} c={c} />)}</Section>
      ) : null}
      {d.likely_origin?.summary ? (
        <Section title="Likely origin">
          <div className="flex flex-wrap items-center gap-2"><span className="text-amber-bright">{d.likely_origin.summary}</span><BasisTag basis={d.likely_origin.basis} /><Conf c={d.likely_origin.confidence} /></div>
        </Section>
      ) : null}
      {arr<NonNullable<AnalysisResult['landmarks']>[number]>(d.landmarks).length > 0 ? (
        <Section title="Landmarks">
          {arr<NonNullable<AnalysisResult['landmarks']>[number]>(d.landmarks).map((l, i) => (
            <div key={i} className="py-1"><span className="text-amber-bright">{l.name}</span> <BasisTag basis={l.basis} /> <Conf c={l.confidence} />{l.notes ? <div className="text-[11px] text-amber-dim">{l.notes}</div> : null}</div>
          ))}
        </Section>
      ) : null}
      {arr<NonNullable<AnalysisResult['logos_brands']>[number]>(d.logos_brands).length > 0 ? (
        <Section title="Logos & brands">
          {arr<NonNullable<AnalysisResult['logos_brands']>[number]>(d.logos_brands).map((l, i) => (
            <div key={i} className="py-1"><span className="text-amber-bright">{l.name}</span> <span className="chip">{l.kind}</span> <BasisTag basis={l.basis} /> <Conf c={l.confidence} /></div>
          ))}
        </Section>
      ) : null}
      {people.length > 0 ? (
        <Section title={`People described (${d.people_count ?? people.length})`}>
          {people.map((p, i) => (
            <div key={i} className="mb-3 border border-amber-dim/60 p-2">
              <div className="text-amber-bright">{p.label} <span className="text-[11px] text-amber-dim">· {p.position_in_frame}</span></div>
              <ClaimRow label="Age range" c={p.apparent_age_range} />
              <ClaimRow label="Expression" c={p.expression} />
              <ClaimRow label="Clothing" c={p.clothing} />
              <ClaimRow label="Hair" c={p.hair} />
              <ClaimRow label="Accessories" c={p.accessories} />
              {arr<Claim>(p.distinguishing_features).map((c, j) => <ClaimRow key={j} label={j === 0 ? 'Distinct.' : ''} c={c} />)}
            </div>
          ))}
          {d.identification_notice ? <p className="text-[11px] text-amber-dim">{d.identification_notice}</p> : null}
        </Section>
      ) : null}
      {arr<SuggestedQuery>(d.suggested_queries).length > 0 ? (
        <Section title="Suggested searches"><QuickSearch queries={arr<SuggestedQuery>(d.suggested_queries)} /></Section>
      ) : null}
      {strs(d.limitations).length > 0 ? (
        <Section title="Limitations"><ul className="list-inside list-disc text-amber-dim">{strs(d.limitations).map((l, i) => <li key={i}>{l}</li>)}</ul></Section>
      ) : null}
    </>
  );
}

function LocationTab({ d, mode }: { d: AnalysisResult; mode: Mode }) {
  const c = d.conclusion;
  if (mode !== 'geo' && !c) return <Empty>run the Geolocation mode to populate this tab</Empty>;
  if (!c && !d.visual_clues) return <Empty>waiting for location data…</Empty>;
  const hasCoords = typeof c?.latitude === 'number' && typeof c?.longitude === 'number';
  return (
    <>
      {c ? (
        <Section title="Estimated location">
          <div className="text-base text-amber-bright">{c.location_name}</div>
          <div className="text-amber-dim">{[c.region_or_city, c.country].filter(Boolean).join(', ')}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2"><BasisTag basis={c.basis} /><Conf c={c.confidence} />
            {typeof c.uncertainty_radius_km === 'number' ? <span className="chip">±{c.uncertainty_radius_km} km</span> : null}
          </div>
          {hasCoords ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="chip text-amber-bright">{c.latitude!.toFixed(5)}, {c.longitude!.toFixed(5)}</span>
              <a className="chip gap-1 hover:bg-amber hover:text-black" href={osmUrl(c.latitude!, c.longitude!)} target="_blank" rel="noopener noreferrer">OpenStreetMap <ExternalLink size={10} /></a>
              <a className="chip gap-1 hover:bg-amber hover:text-black" href={googleMapsUrl(c.latitude!, c.longitude!)} target="_blank" rel="noopener noreferrer">Google Maps <ExternalLink size={10} /></a>
            </div>
          ) : <p className="mt-2 text-amber-dim">No coordinates could be determined.</p>}
        </Section>
      ) : null}
      {arr<NonNullable<AnalysisResult['visual_clues']>[number]>(d.visual_clues).length > 0 ? (
        <Section title="1 · Visual clues">
          {arr<NonNullable<AnalysisResult['visual_clues']>[number]>(d.visual_clues).map((v, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 py-1">
              <span className="chip">{v.category}</span><span className="text-amber-bright">{v.observation}</span><BasisTag basis={v.basis} /><Conf c={v.confidence} />
            </div>
          ))}
        </Section>
      ) : null}
      {strs(d.reasoning_steps).length > 0 ? (
        <Section title="2 · Reasoning chain"><ol className="list-inside list-decimal space-y-1">{strs(d.reasoning_steps).map((s, i) => <li key={i}>{s}</li>)}</ol></Section>
      ) : null}
      {arr<NonNullable<AnalysisResult['alternatives']>[number]>(d.alternatives).length > 0 ? (
        <Section title="Alternatives">
          {arr<NonNullable<AnalysisResult['alternatives']>[number]>(d.alternatives).map((a, i) => (
            <div key={i} className="py-1"><span className="text-amber-bright">{a.location_name}</span> <Conf c={a.confidence} />
              {typeof a.latitude === 'number' && typeof a.longitude === 'number' ? <span className="ml-2 text-[11px] text-amber-dim">{a.latitude.toFixed(3)}, {a.longitude.toFixed(3)}</span> : null}
            </div>
          ))}
        </Section>
      ) : null}
    </>
  );
}

function TextTab({ d }: { d: AnalysisResult }) {
  const items = arr<NonNullable<AnalysisResult['ocr_text']>[number]>(d.ocr_text);
  if (items.length === 0) return <Empty>no legible text detected{d.summary ? '' : ' yet'}</Empty>;
  return (
    <ul className="space-y-2">
      {items.map((o, i) => (
        <li key={i} className="border border-amber-dim/60 p-2">
          <div className="whitespace-pre-wrap text-amber-bright">{o.text}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-amber-dim">
            {o.language ? <span className="chip">{o.language}</span> : null}<span>{o.location_in_image}</span><Conf c={o.confidence} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ForensicsTab({ d, meta, mode }: { d: AnalysisResult; meta: ForensicsMeta | null; mode: Mode }) {
  if (mode !== 'forensics' && !meta) return <Empty>run the Forensics mode to populate this tab</Empty>;
  return (
    <>
      {d.manipulation_likelihood || d.ai_generated_likelihood ? (
        <Section title="Verdict">
          <div className="flex flex-wrap gap-2">
            {d.manipulation_likelihood ? <span className="chip text-amber-bright">manipulation: {d.manipulation_likelihood.replace('_', ' ')}</span> : null}
            {d.ai_generated_likelihood ? <span className="chip text-amber-bright">AI-generated: {d.ai_generated_likelihood}</span> : null}
          </div>
        </Section>
      ) : null}
      {arr<NonNullable<AnalysisResult['indicators']>[number]>(d.indicators).length > 0 ? (
        <Section title="Indicators">
          {arr<NonNullable<AnalysisResult['indicators']>[number]>(d.indicators).map((x, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 py-1"><span className="chip">{x.type}</span><span className="text-amber-bright">{x.observation}</span><BasisTag basis={x.basis} /><Conf c={x.confidence} /></div>
          ))}
        </Section>
      ) : null}
      {meta ? (
        <>
          <Section title="Error level analysis">
            {meta.ela ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={meta.ela.dataUrl} alt="ELA map" className="mb-2 max-h-80 border border-amber-dim bg-black" />
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="chip">q={meta.ela.quality}</span><span className="chip">mean {meta.ela.meanDiff}</span><span className="chip">max {meta.ela.maxDiff}</span>
                  <span className="chip">σ {meta.ela.stdDiff}</span><span className="chip">hotspot ×{meta.ela.hotspotRatio}</span>
                </div>
                <p className="mt-1 text-[11px] text-amber-dim">{meta.ela.note}</p>
                {d.ela_assessment ? <p className="mt-2">{d.ela_assessment}</p> : null}
              </>
            ) : <Empty>ELA could not be computed for this image</Empty>}
          </Section>
          <Section title="Content credentials (C2PA)">
            <div className="flex items-center gap-2"><span className={`chip ${meta.c2pa.present ? 'border-ok text-ok' : ''}`}>{meta.c2pa.present ? 'manifest detected' : 'none detected'}</span>{meta.c2pa.indicators.map((x) => <span key={x} className="chip">{x}</span>)}</div>
            <p className="mt-1 text-[11px] text-amber-dim">{meta.c2pa.note}</p>
            {d.provenance_assessment ? <p className="mt-2">{d.provenance_assessment}</p> : null}
          </Section>
          <Section title={`EXIF / XMP (${meta.sourceFormat})`}>
            {meta.exif ? (
              <div className="max-h-96 overflow-auto border border-amber-dim/60">
                <table className="w-full text-left text-[11px]"><tbody>
                  {Object.entries(meta.exif).map(([k, v]) => (
                    <tr key={k} className="border-b border-amber-dim/30 align-top"><td className="whitespace-nowrap p-1 pr-3 text-amber-dim">{k}</td><td className="break-all p-1 text-amber-bright">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td></tr>
                  ))}
                </tbody></table>
              </div>
            ) : <Empty>no EXIF/XMP metadata found (common after platform re-uploads)</Empty>}
            {d.metadata_assessment ? <p className="mt-2">{d.metadata_assessment}</p> : null}
          </Section>
        </>
      ) : null}
    </>
  );
}

/* ───────── panel ───────── */
export default function ResultPanel({
  data, raw, meta, streaming, mode,
}: { data: AnalysisResult | null; raw: string; meta: ForensicsMeta | null; streaming: boolean; mode: Mode }) {
  const [copied, setCopied] = useState(false);
  const d: AnalysisResult = data ?? {};
  const json = data ? JSON.stringify(data, null, 2) : raw;

  async function copy() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Tabs defaultValue="summary">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="location">Location</TabsTrigger>
        <TabsTrigger value="text">Text (OCR)</TabsTrigger>
        <TabsTrigger value="forensics">Forensics</TabsTrigger>
        <TabsTrigger value="raw">Raw JSON</TabsTrigger>
        {streaming ? <span className="ml-auto self-center text-[10px] uppercase tracking-widest text-amber animate-pulse">● streaming</span> : null}
      </TabsList>
      <TabsContent value="summary"><SummaryTab d={d} /></TabsContent>
      <TabsContent value="location"><LocationTab d={d} mode={mode} /></TabsContent>
      <TabsContent value="text"><TextTab d={d} /></TabsContent>
      <TabsContent value="forensics"><ForensicsTab d={d} meta={meta} mode={mode} /></TabsContent>
      <TabsContent value="raw">
        <div className="mb-2"><Button size="sm" onClick={copy}><Copy size={12} />{copied ? 'Copied' : 'Copy JSON'}</Button></div>
        <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap break-all border border-amber-dim/60 p-2 text-[11px] text-amber-bright">{json || '// nothing yet'}</pre>
      </TabsContent>
    </Tabs>
  );
}

import 'server-only';
import sharp from 'sharp';
import exifr from 'exifr';
import type { C2paResult, ElaResult, ForensicsMeta } from '@/types';

function sanitize(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v.length > 500 ? `${v.slice(0, 500)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Uint8Array) return `[binary ${v.length} bytes]`;
  if (Array.isArray(v)) return depth > 3 ? '[array]' : v.slice(0, 50).map((x) => sanitize(x, depth + 1));
  if (typeof v === 'object') {
    if (depth > 3) return '[object]';
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 200)) {
      out[k] = sanitize(val, depth + 1);
    }
    return out;
  }
  return String(v);
}

export async function extractExif(buffer: Buffer): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await exifr.parse(buffer, {
      tiff: true, xmp: true, iptc: true, jfif: true, ihdr: true, icc: false,
      gps: true, translateValues: true, reviveValues: true, sanitize: true, mergeOutput: true,
    });
    if (!data || typeof data !== 'object') return null;
    const clean = sanitize(data) as Record<string, unknown>;
    return Object.keys(clean).length ? clean : null;
  } catch {
    return null;
  }
}

/** Error Level Analysis: recompress at a fixed JPEG quality and amplify the difference. */
export async function runEla(input: Buffer, quality = 90): Promise<ElaResult> {
  const MAX_EDGE = 4096; // bounds memory; the ELA map is a visualisation, not sent to Gemini
  const base = sharp(input)
    .rotate()
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .toColourspace('srgb')
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });

  const { data: orig, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const jpeg = await sharp(orig, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .jpeg({ quality })
    .toBuffer();
  const { data: re } = await sharp(jpeg).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });

  const n = Math.min(orig.length, re.length);
  const diff = new Uint8Array(n);
  let sum = 0;
  let sumSq = 0;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(orig[i] - re[i]);
    diff[i] = d;
    sum += d;
    sumSq += d * d;
    if (d > max) max = d;
  }
  const mean = n ? sum / n : 0;
  const std = Math.sqrt(Math.max(0, (n ? sumSq / n : 0) - mean * mean));

  // Hotspot ratio: strongest 16x16 block vs. global mean. Localised edits tend to stand out.
  const { width: w, height: h, channels: ch } = info;
  const bs = 16;
  const bxs = Math.floor(w / bs);
  const bys = Math.floor(h / bs);
  let maxBlock = 0;
  for (let by = 0; by < bys; by++) {
    for (let bx = 0; bx < bxs; bx++) {
      let s = 0;
      for (let y = 0; y < bs; y++) {
        const row = ((by * bs + y) * w + bx * bs) * ch;
        for (let k = 0; k < bs * ch; k++) s += diff[row + k];
      }
      const m = s / (bs * bs * ch);
      if (m > maxBlock) maxBlock = m;
    }
  }

  const scale = Math.min(40, 255 / Math.max(max, 1));
  const amplified = Buffer.alloc(n);
  for (let i = 0; i < n; i++) amplified[i] = Math.min(255, Math.round(diff[i] * scale));
  const png = await sharp(amplified, { raw: { width: w, height: h, channels: ch } })
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    quality,
    meanDiff: r2(mean),
    maxDiff: max,
    stdDiff: r2(std),
    hotspotRatio: r2(maxBlock / Math.max(mean, 0.01)),
    note: 'Heuristic. Re-saved images, sharp edges and screenshots also produce high error levels. Lossless sources (PNG) are far less informative.',
  };
}

/** Byte-level detection of a C2PA manifest (JUMBF box labelled "c2pa"). Does NOT verify signatures. */
export function detectC2pa(buffer: Buffer): C2paResult {
  const indicators: string[] = [];
  const hasJumb = buffer.includes('jumb');
  const hasC2pa = buffer.includes('c2pa');
  if (hasJumb) indicators.push('JUMBF container ("jumb")');
  if (hasC2pa) indicators.push('C2PA label ("c2pa")');
  if (buffer.includes('c2pa.claim')) indicators.push('claim box ("c2pa.claim")');
  if (buffer.includes('contentauth')) indicators.push('Content Authenticity marker');
  const present = hasJumb && hasC2pa;
  return {
    present,
    indicators,
    note: present
      ? 'A C2PA manifest appears to be embedded. Verify its signature with a C2PA validator (e.g. contentcredentials.org/verify or c2patool).'
      : 'No C2PA manifest detected. Absence is common; metadata is often stripped by platforms.',
  };
}

export async function collectForensics(buffer: Buffer, sourceFormat: string): Promise<ForensicsMeta> {
  const [exif, ela] = await Promise.all([
    extractExif(buffer),
    runEla(buffer).catch((): ElaResult | null => null),
  ]);
  return { sourceFormat, exif, ela, c2pa: detectC2pa(buffer) };
}

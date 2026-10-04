export type Mode = 'reverse' | 'geo' | 'face' | 'forensics';
export const MODES: readonly Mode[] = ['reverse', 'geo', 'face', 'forensics'] as const;
export type Basis = 'observed' | 'inferred' | 'speculated';

export interface Claim { text: string; confidence: number; basis: Basis }
export interface SuggestedQuery { query: string; rationale: string }
export interface OcrItem {
  text: string;
  language: string | null;
  location_in_image: string;
  confidence: number;
}
export interface GeoConclusion {
  location_name: string;
  country: string;
  region_or_city: string;
  latitude: number | null;
  longitude: number | null;
  confidence: number;
  uncertainty_radius_km: number | null;
  basis: Basis;
}
export interface Person {
  label: string;
  position_in_frame: string;
  apparent_age_range: Claim;
  expression: Claim;
  clothing: Claim;
  hair: Claim;
  accessories: Claim;
  distinguishing_features: Claim[];
}

/** Superset of all four modes' schemas; every field is optional so partial streams render. */
export interface AnalysisResult {
  contains_id_document?: boolean;
  summary?: string;
  detailed_description?: string;
  key_observations?: Claim[];
  likely_origin?: { summary: string; confidence: number; basis: Basis };
  ocr_text?: OcrItem[];
  landmarks?: { name: string; confidence: number; basis: Basis; notes: string }[];
  logos_brands?: { name: string; kind: string; confidence: number; basis: Basis }[];
  visual_clues?: { category: string; observation: string; basis: Basis; confidence: number }[];
  reasoning_steps?: string[];
  conclusion?: GeoConclusion;
  alternatives?: { location_name: string; latitude: number | null; longitude: number | null; confidence: number }[];
  people_count?: number;
  people?: Person[];
  identification_notice?: string;
  manipulation_likelihood?: string;
  ai_generated_likelihood?: string;
  indicators?: { type: string; observation: string; confidence: number; basis: Basis }[];
  metadata_assessment?: string;
  ela_assessment?: string;
  provenance_assessment?: string;
  suggested_queries?: SuggestedQuery[];
  limitations?: string[];
}

export interface ElaResult {
  dataUrl: string;
  quality: number;
  meanDiff: number;
  maxDiff: number;
  stdDiff: number;
  hotspotRatio: number;
  note: string;
}
export interface C2paResult { present: boolean; indicators: string[]; note: string }
export interface ForensicsMeta {
  sourceFormat: string;
  exif: Record<string, unknown> | null;
  ela: ElaResult | null;
  c2pa: C2paResult;
}

export type StreamEvent =
  | { type: 'start'; mode: Mode; phash: string; cached: boolean; model: string; width: number; height: number; bytes: number }
  | { type: 'meta'; forensics: ForensicsMeta }
  | { type: 'chunk'; text: string }
  | { type: 'done'; result: AnalysisResult; cached: boolean }
  | { type: 'error'; code: string; message: string; resetAt?: number };

import type { Mode } from '@/types';

type Schema = Record<string, unknown>;

const str = (description: string): Schema => ({ type: 'STRING', description });
const num = (description: string): Schema => ({ type: 'NUMBER', description });
const nnum = (description: string): Schema => ({ type: 'NUMBER', nullable: true, description });
const bool = (description: string): Schema => ({ type: 'BOOLEAN', description });
const arr = (items: Schema, description?: string): Schema => ({ type: 'ARRAY', items, ...(description ? { description } : {}) });
const obj = (properties: Record<string, Schema>): Schema => ({
  type: 'OBJECT',
  properties,
  required: Object.keys(properties),
  // Gemini emits keys in this order: this is what makes "clues → reasoning → answer" work.
  propertyOrdering: Object.keys(properties),
});
const enumStr = (values: string[], description: string): Schema => ({ type: 'STRING', enum: values, description });

const CONF = num('Confidence from 0.0 to 1.0');
const BASIS = enumStr(['observed', 'inferred', 'speculated'], 'observed = directly visible; inferred = follows from visible evidence; speculated = weakly supported');

const claim = obj({ text: str('The claim, one sentence. "unknown" if not determinable.'), confidence: CONF, basis: BASIS });

const ID_FLAG = bool('true only if the image mainly shows an identity document (passport, national ID, driver licence, residence permit, student/employee ID card).');

const ocrItem = obj({
  text: str('Exact visible text, verbatim'),
  language: { type: 'STRING', nullable: true, description: 'ISO language name or null' },
  location_in_image: str('Where in the frame, e.g. "top-left sign"'),
  confidence: CONF,
});

const suggestedQueries = arr(
  obj({ query: str('A concrete web-search query'), rationale: str('Why this query may surface the origin or context') }),
  '5-10 distinct queries. Never aim at learning the name of a depicted person.',
);
const limitations = arr(str('A limitation or uncertainty'), 'What could not be determined and why');
const ocr = arr(ocrItem, 'All legible text; empty array if none');

const reverse = obj({
  contains_id_document: ID_FLAG,
  summary: str('2-3 sentence overview'),
  detailed_description: str('Thorough description of scene, subjects, objects, setting'),
  key_observations: arr(claim),
  likely_origin: obj({ summary: str('Likely source/context, or "unknown"'), confidence: CONF, basis: BASIS }),
  ocr_text: ocr,
  landmarks: arr(obj({ name: str('Landmark name or "unknown"'), confidence: CONF, basis: BASIS, notes: str('Supporting evidence') })),
  logos_brands: arr(obj({ name: str('Brand/logo name'), kind: str('logo | product | signage | packaging | other'), confidence: CONF, basis: BASIS })),
  suggested_queries: suggestedQueries,
  limitations,
});

const geo = obj({
  contains_id_document: ID_FLAG,
  summary: str('One-paragraph geolocation verdict'),
  visual_clues: arr(
    obj({
      category: enumStr(
        ['signage', 'language_script', 'architecture', 'vegetation', 'terrain', 'sun_shadow', 'vehicles_plates', 'infrastructure', 'clothing_culture', 'landmark', 'other'],
        'Clue category',
      ),
      observation: str('What is visible'),
      basis: BASIS,
      confidence: CONF,
    }),
    'STEP 1: list the visual clues first.',
  ),
  reasoning_steps: arr(str('One reasoning step'), 'STEP 2: reason from the clues to candidate locations, weighing contradictions.'),
  conclusion: obj({
    location_name: str('Most specific supportable place name, or "unknown"'),
    country: str('Country or "unknown"'),
    region_or_city: str('Region/city or "unknown"'),
    latitude: nnum('Decimal degrees, or null if not determinable'),
    longitude: nnum('Decimal degrees, or null if not determinable'),
    confidence: CONF,
    uncertainty_radius_km: nnum('Approximate radius of uncertainty in km, or null'),
    basis: BASIS,
  }),
  alternatives: arr(obj({ location_name: str('Alternative'), latitude: nnum('lat or null'), longitude: nnum('lon or null'), confidence: CONF })),
  ocr_text: ocr,
  suggested_queries: suggestedQueries,
  limitations,
});

const fieldClaim = claim;
const face = obj({
  contains_id_document: ID_FLAG,
  summary: str('Neutral overview of the people visible'),
  people_count: num('Number of distinct people visible'),
  people: arr(obj({
    label: str('Neutral label such as "Person 1"'),
    position_in_frame: str('Where the person is in the frame'),
    apparent_age_range: fieldClaim,
    expression: fieldClaim,
    clothing: fieldClaim,
    hair: fieldClaim,
    accessories: fieldClaim,
    distinguishing_features: arr(claim),
  })),
  identification_notice: str('State that no identification was attempted and that names are not inferred.'),
  ocr_text: ocr,
  suggested_queries: suggestedQueries,
  limitations,
});

const forensics = obj({
  contains_id_document: ID_FLAG,
  summary: str('Plain-language forensic verdict'),
  manipulation_likelihood: enumStr(['none_detected', 'low', 'moderate', 'high', 'inconclusive'], 'Likelihood of editing/compositing'),
  ai_generated_likelihood: enumStr(['unlikely', 'possible', 'likely', 'inconclusive'], 'Likelihood the image is fully synthetic'),
  indicators: arr(obj({
    type: enumStr(['metadata', 'compression', 'lighting', 'geometry', 'texture', 'text', 'edges', 'provenance', 'other'], 'Indicator category'),
    observation: str('What was found'),
    confidence: CONF,
    basis: BASIS,
  })),
  metadata_assessment: str('What the EXIF/XMP data does and does not tell us'),
  ela_assessment: str('Interpretation of the error-level-analysis statistics. ELA is heuristic.'),
  provenance_assessment: str('Interpretation of the C2PA/Content Credentials detection result'),
  ocr_text: ocr,
  suggested_queries: suggestedQueries,
  limitations,
});

export const SCHEMAS: Record<Mode, Schema> = { reverse, geo, face, forensics };

import 'server-only';
import sharp from 'sharp';
import { AppError } from './errors';
import { env } from './env';

interface ClassResult { label: string; score: number }
type Classifier = (input: unknown) => Promise<ClassResult[] | ClassResult>;
let classifierPromise: Promise<Classifier> | null = null;

async function getClassifier(): Promise<Classifier> {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const tf = await import('@huggingface/transformers');
      tf.env.cacheDir = '/tmp/hf-cache'; // the only writable path on Vercel
      tf.env.allowLocalModels = false;
      // Cast: transformers.js's pipeline() overloads trigger "union too complex" in strict TS.
      const make = tf.pipeline as unknown as (task: string, model: string) => Promise<Classifier>;
      return make('image-classification', env.nsfwModel);
    })().catch((e) => {
      classifierPromise = null; // allow retry on next request
      throw e;
    });
  }
  return classifierPromise;
}

export interface ModerationResult {
  checked: boolean;
  nsfwScore: number;
  blocked: boolean;
}

/** Runs the local NSFW classifier. No image leaves the server. */
export async function moderateImage(buffer: Buffer): Promise<ModerationResult> {
  try {
    const small = await sharp(buffer).rotate().flatten({ background: '#ffffff' }).resize(512, 512, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
    const classifier = await getClassifier();
    const tf = await import('@huggingface/transformers');
    const image = await tf.RawImage.fromBlob(new Blob([new Uint8Array(small)], { type: 'image/jpeg' }));
    const out = await classifier(image);
    const list = Array.isArray(out) ? out : [out];
    const nsfw = list.find((r) => r.label.toLowerCase() === 'nsfw')?.score ?? 0;
    return { checked: true, nsfwScore: nsfw, blocked: nsfw >= env.nsfwThreshold };
  } catch (e) {
    console.error('[moderation] classifier failure:', e instanceof Error ? e.message : 'unknown');
    if (env.moderationFailOpen) return { checked: false, nsfwScore: 0, blocked: false };
    throw new AppError('moderation_unavailable', 'Content moderation is temporarily unavailable. Please retry shortly.');
  }
}

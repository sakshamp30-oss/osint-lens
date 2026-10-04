import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import imghash from 'imghash';
import { AppError } from './errors';

const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export interface ImageInfo {
  buffer: Buffer;
  mime: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  phash: string;
}

/**
 * Validates the upload and computes hashes. The ORIGINAL bytes are what we later send to
 * Gemini: full resolution, no re-encoding, never downscaled.
 */
export async function inspectImage(buffer: Buffer, maxBytes: number): Promise<ImageInfo> {
  if (buffer.length === 0) throw new AppError('bad_request', 'The uploaded file is empty.');
  if (buffer.length > maxBytes) {
    throw new AppError('image_too_large', `Image exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`);
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw new AppError('unsupported_format', 'Could not read this file as an image. Use JPEG, PNG or WebP.');
  }
  const mime = meta.format ? FORMAT_TO_MIME[meta.format] : undefined;
  if (!mime || !meta.format || !meta.width || !meta.height) {
    throw new AppError('unsupported_format', `Unsupported image format${meta.format ? ` (${meta.format})` : ''}. Use JPEG, PNG or WebP.`);
  }

  // pHash on a normalised 256x256 PNG (imghash decodes PNG/JPEG only). 16 bits => 256-bit hash.
  const normalised = await sharp(buffer)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(256, 256, { fit: 'fill' })
    .png()
    .toBuffer();
  const phash = await imghash.hash(normalised, 16, 'hex');

  return {
    buffer,
    mime,
    format: meta.format,
    width: meta.width,
    height: meta.height,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    phash,
  };
}

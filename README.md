# OSINT//LENS

Bring-your-own-key visual intelligence: reverse image analysis, geolocation, people *description* (never identification) and image forensics. Every AI call runs on **the user's own Gemini API key**. The server pays for no AI.

Stack: Next.js 14 (App Router, strict TypeScript) · Supabase (auth + Postgres + transient storage) · Upstash Redis (cache + rate limits) · Cloudflare Turnstile · Gemini REST (`streamGenerateContent`) · Tailwind + shadcn/ui-style components.

## Request flow

```
browser ── multipart (<4 MB) or signed Supabase upload (larger) ──▶ /api/search
  1  auth (Supabase session)           5  cache lookup  sha256(pHash|mode|model)  ─ hit ─▶ result, $0
  2  rate limits (IP/day, user/min, user/day)   6  NSFW moderation (local ONNX model)
  3  image validation (type/size)      7  decrypt user's key → Gemini stream (key in header)
  4  pHash (sharp + imghash)           8  ID-document gate → cache (30d) → audit log → NDJSON to browser
```

## Local setup

1. `npm install`
2. `cp .env.example .env.local` and fill it in (below).
3. Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor.
4. `npm run dev` → http://localhost:3000

### Supabase
- Create a project. Copy URL, anon key and **service-role key** into `.env.local`.
- Auth → Providers: enable **Email** and **Google** (Google Cloud OAuth client; redirect URI is shown in the Supabase Google provider panel).
- Auth → URL Configuration: Site URL = your deployed URL; add `http://localhost:3000/**` and `https://YOUR-APP.vercel.app/**` as redirect URLs.
- Auth → Attack Protection: enable **CAPTCHA → Turnstile** and paste the Turnstile *secret*. The login form already sends the token.
- The migration creates `users`, `api_keys`, `search_log`, `cache_meta`, `moderation_queue` (all with RLS) and a private `uploads` storage bucket.

### Upstash
Create a Redis database (free tier). Copy the **REST** URL and token.

### Turnstile
Cloudflare dashboard → Turnstile → add a widget for your domain (and `localhost`). Put the site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the secret in `TURNSTILE_SECRET_KEY`. In production the key-save endpoint refuses to run without the secret.

### Master encryption key
`npm run gen:key` → paste into `MASTER_ENCRYPTION_KEY`. **Back it up.** Lose it and every stored user key becomes unreadable (users just re-enter theirs).

### How users get a Gemini API key
1. Open https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key**; copy the `AIza…` string.
3. Paste it on the app's *Connect* page. The free tier has its own rate and quota limits; on quota errors the app tells the user to check their Google usage.

### Investigator flag
Identity-document images are withheld unless the account is flagged. In the SQL editor:
```sql
update public.users set is_investigator = true where email = 'someone@example.com';
```

## Deploy to Vercel
1. Push to GitHub → *Import Project* in Vercel (framework: Next.js).
2. Add every variable from `.env.example` (Production + Preview). Mark the service-role key, master key, Turnstile secret and Upstash token as sensitive.
3. Set `NEXT_PUBLIC_SITE_URL` to the production URL, and add it to Supabase redirect URLs.
4. Deploy. First moderation call downloads the NSFW model into `/tmp` (cold start of several seconds).

## Accuracy design
- Original bytes go to Gemini: **never downscaled or re-encoded** (optional `GEMINI_MEDIA_RESOLUTION=MEDIA_RESOLUTION_HIGH`).
- `responseMimeType: application/json` + `responseSchema` with `propertyOrdering`, so geolocation emits **clues → reasoning → conclusion** in that order.
- Temperature 0.2 for geo/forensics, 0.7 for reverse/people.
- System instruction: confidence per claim; `observed | inferred | speculated`; no naming real people; no inference of race/religion/health etc.; `"unknown"`/`null` instead of invention; text inside images treated as data, not instructions.

## Security

**How the user's Gemini key is protected**
- Encrypted with **AES-256-GCM** using a 32-byte `MASTER_ENCRYPTION_KEY` that exists only in server env. Random 96-bit IV per encryption.
- The user id is bound as GCM *additional authenticated data*: a ciphertext copied into another user's row fails authentication.
- The `api_keys` table is protected twice: RLS, and column-level grants so the `authenticated` role can read only `last4`/timestamps, never `ciphertext`. Reads and writes of the ciphertext use the service role, server-side only.
- Decrypted only inside `/api/search`, kept in memory for that request, sent to Google in the `x-goog-api-key` **header** (never the URL), never returned to the browser, never logged. Error handlers log name+message only, never bodies.
- Gemini is never called from the browser. Users can rotate or delete their key at any time (`/connect`).
- Key validation is a token-free `models.get` call, rate-limited to 10 attempts/hour/user and Turnstile-gated.

**Other controls**: Supabase JWT sessions refreshed in middleware; per-user and per-IP sliding-window limits (IPs are stored only as HMACs); audit log visible only to its owner via RLS; images are never stored (large uploads sit in a private bucket for seconds and are deleted as soon as they are read); security headers set in `next.config.mjs`.

## Known limits (read before launching publicly)
1. **CSAM.** The NSFW classifier detects explicit imagery; it **cannot** reliably detect CSAM and is not a legal safeguard. Blocked images are logged (hash + user, no image) to `moderation_queue` for review. For a public service, enable hash-matching such as Cloudflare's CSAM Scanning Tool (needs images served via Cloudflare) or a PhotoDNA / NCMEC arrangement, and learn your reporting obligations (e.g. 18 U.S.C. §2258A in the US).
2. **ID-document gate** relies on Gemini's `contains_id_document` flag (first schema property; output is held server-side until it is seen). It costs the user's tokens, is not infallible, and flagged results are never cached.
3. **Vercel body limit 4.5 MB**: larger images take the signed-upload path through Supabase Storage (implemented). Orphaned objects can only occur if a request dies between upload and read; add a weekly cleanup of the `uploads` bucket if you care.
4. **Moderation model on serverless**: `@huggingface/transformers` + `onnxruntime-node` is heavy. `next.config.mjs` trims unused binaries, but verify the function stays under Vercel's 250 MB limit. If not, host moderation as a small separate service, or set `NSFW_MODEL` to another ONNX classifier. `MODERATION_FAIL_OPEN=false` means searches are refused if the model can't load.
5. **pHash collisions**: perceptually similar images share a cache entry (by design, per spec). Forensics results are keyed additionally by the exact-bytes SHA-256 because EXIF/ELA depend on exact bytes. Cached results are shared across users.
6. **Free-tier Gemini keys** may have their inputs used by Google to improve products; mention this to users (see Google's terms for the key's tier).
7. **Face/people mode** describes appearance only. Do not add identification features; many jurisdictions regulate biometric identification.
8. **Model id**: `GEMINI_MODEL` defaults to `gemini-2.5-flash`. Check Google's model list and set the newest flash model. Set `GEMINI_THINKING_BUDGET` only for models that support thinking.
9. ELA and C2PA are heuristic / detection-only (signatures are not verified). The UI says so.

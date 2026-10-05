# TODO

Known issues, planned work, and future features for OSINT//LENS.

**Legend:** 🔴 blocker · 🟠 important · 🟡 nice-to-have · 🔵 future

---

## 🔴 Blockers — must fix before any public deployment

### CSAM hash-matching
The NSFW classifier cannot reliably detect CSAM. Deploying a public tool without hash-matching is a legal liability.

- [ ] Integrate Cloudflare CSAM Scanning Tool, PhotoDNA, or equivalent
- [ ] Define reporting obligations for your jurisdiction
- [ ] Document the review process for flagged uploads

---

## 🟠 Important — functional bugs

### Usage counter increments on failed searches
The header shows `TODAY X/100 · MIN X/10`. Failed searches (503s, moderation
errors, malformed requests) currently consume a credit.

- [ ] Move the rate-limit increment to *after* the search succeeds
- [ ] Or: refund the credit if `/api/search` returns a non-200
- [ ] Add a test: one failed search + one success = 1 credit used, not 2

**Where to look:** `src/lib/ratelimit.ts`, `src/app/api/search/route.ts`

### Rate limiter needs tuning
Current limits (`100/day`, `10/min`) are arbitrary. Test with realistic
usage and adjust.

- [ ] Decide limits based on your Gemini API key's own quota
- [ ] Make limits env-configurable (`RATELIMIT_DAY`, `RATELIMIT_MIN`)
- [ ] Return `Retry-After` header on 429 so the UI can show a countdown

---

## 🟡 Nice-to-have — polish

### Cache improvement
Currently cached by `pHash + mode + model`. Fine, but:

- [ ] Log cache hit/miss ratio somewhere so you can see if it's working
- [ ] Add a manual "clear cache for this image" option in the audit log
- [ ] Consider TTL tuning per mode (geolocation results age faster than
  forensics)

### Error message quality
Some errors surface raw text from Google. Wrap them.

- [ ] Map common Gemini errors to friendly messages:
  - `503` → "Gemini is busy, retrying with a fallback model"
  - `429` → "You're going too fast, try again in N seconds"
  - `SAFETY` → "Gemini's safety filters blocked this image"
- [ ] Show a retry button on transient errors
- [ ] Never show raw API error text to the user

### Upload UX
- [ ] Show upload progress bar for large files
- [ ] Warn before uploading >10 MB
- [ ] Support pasting images directly from clipboard (partially there)
- [ ] Allow batch upload of multiple images
- [ ] Support HEIC / WebP explicitly and verify Gemini handles them

### Audit log
- [ ] Add filter by mode / date range
- [ ] Add "re-run this search" button
- [ ] Export to JSON / CSV
- [ ] Show cost estimate per search

---

## 🔵 Future features

### Reverse image search → public web presence
Find where an image has been posted online (social media, news, forums). This
is the feature that was discussed but not built.

**This is NOT facial recognition** — it finds the *image*, not the *person*.

- [ ] Sign up for Apify (or TinEye / Bright Data) and get an API token
- [ ] Add `APIFY_TOKEN` to `.env.local` and Vercel env
- [ ] Create `src/lib/reverseSearch.ts` that calls the actor and returns URLs
- [ ] Add a "Web presence" tab to `ResultPanel`
- [ ] Filter results to highlight social media domains (instagram, twitter, facebook, tiktok, reddit, etc.)
- [ ] Cache results by pHash like the Gemini calls

**Budget note:** most reverse-search APIs charge per result. Add a per-day
cap separate from the Gemini counter so you don't blow through your budget.

### Additional BYOK providers
Let users bring keys for other AI providers.

- [ ] OpenAI (GPT-4o vision)
- [ ] Anthropic (Claude with vision)
- [ ] Provider selection UI on the Connect page
- [ ] Store provider alongside the encrypted key in the DB

### Bulk / batch mode
For OSINT researchers processing sets of images.

- [ ] Upload a zip or select multiple files
- [ ] Queue processing with progress indicators
- [ ] Download results as a JSON bundle
- [ ] Optional: webhook callback when done

### Reporting / export
- [ ] One-click export of a full analysis as PDF
- [ ] Include image, timestamp, model used, and full result JSON
- [ ] Add a case-file wrapper so multiple images can be grouped

### Admin panel
- [ ] View moderation queue
- [ ] Manually ban an account
- [ ] Rotate the `MASTER_ENCRYPTION_KEY` with a re-encryption migration
- [ ] Set per-user quotas (e.g. `is_investigator` gets higher limits)

---

## 📝 Housekeeping

- [ ] Add tests — currently zero test coverage
  - [ ] Unit: `crypto.ts` encrypt/decrypt round-trip
  - [ ] Unit: `partialJson.ts` repair parser
  - [ ] Unit: `image.ts` pHash stability across formats
  - [ ] Integration: full `/api/search` flow with mocked Gemini
- [ ] Add CI (GitHub Actions) — typecheck + lint + tests on PR
- [ ] Add Prettier config and `npm run format` script
- [ ] Review bundle size of `/api/search` after each dependency change
  (`@huggingface/transformers` is the heavy one)
- [ ] Update README's "Known issues" section as items here are resolved

---

## ✅ Done

- [x] Fix NSFW moderation model URL — switched to `onnx-community/nsfw_image_detection-ONNX`
- [x] Restore `MODERATION_FAIL_OPEN=false` (moderation is fail-closed)
- [x] Fix `GEMINI_MODEL` default to a current model (`gemini-3.8-flash`)
- [x] AES-256-GCM encryption for stored Gemini keys
- [x] Model fallback chain (503/429 → next model)
- [x] `AQ.` key format support (Google's new authentication keys)
- [x] Fix `File is not defined` in `/api/search`
- [x] pHash-based caching
- [x] Google OAuth sign-in
- [x] Streaming Gemini responses
- [x] Rate limiting via Upstash
- [x] Audit log
- [x] Fix `AQ.` key regex in `/api/key`
- [x] Model fallback UI error surfacing
- [x] Fix NSFW moderation: pass `RawImage` instead of `Blob` to the classifier
- [x] Make model fallback retry on 404 (retired models)
- [x] Restore `MODERATION_FAIL_OPEN=false` — moderation is fail-closed
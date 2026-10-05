# Security policy

## Reporting a vulnerability

Please do not open a public issue. Email me at sakshamp30@gmail.com with:

- A description of the issue
- Steps to reproduce
- Any proof-of-concept you've built

I'll acknowledge within a few days.

## Known gaps

- No CSAM hash-matching (see README "Known limits")
- Usage counter increments on failed searches (see TODO.md)
- Never tested by anyone other than me — new bugs likely

## Scope

The interesting attack surface:
- AES-256-GCM key storage (`src/lib/crypto.ts`)
- Rate limiting (`src/lib/ratelimit.ts`)
- Gemini key decryption path (`src/app/api/search/route.ts`)
- Prompt injection via image text (`src/lib/gemini/prompts.ts`)

I'm new to security, so this list is my best guess at where the sharp
edges are, not a complete audit. If you find something in one of these
files, or somewhere I didn't list, I'd genuinely like to know.

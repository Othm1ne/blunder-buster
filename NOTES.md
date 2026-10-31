# Don't-forget notes

- **Stockfish is GPL.** Free to use, even commercially, but shipping it to users (in-browser WASM counts)
  means the source code of the app using it must be published. Fine for personal use.
  **Must be resolved before selling** (task V3-1): open-source the app, or run the engine only on our own server.
- **Gemini free tier.** Google may use free-tier prompts to improve its products. Before selling, move to the
  paid tier or disclose it clearly (task V3-2).
- **Gemini key** never goes in the frontend. Call it only through a Cloudflare Pages Function (`/functions`).
- **Hosting** on Cloudflare Pages, not Vercel Hobby (Vercel's free plan forbids commercial use).
- **Cost target: $0.** Firebase Spark plan only (no Cloud Functions, they need Blaze).
- **Opening book** (`public/data/openings.json`) is generated from the Lichess opening list
  (github.com/lichess-org/chess-openings), released as CC0 / public domain: free for commercial use.
  Rebuild with `node scripts/build-openings.mjs`.

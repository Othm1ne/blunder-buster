# Blunder Buster

A fun chess coach that imports your Chess.com games, finds your blunders with Stockfish, and turns them into puzzles.
Task plan: https://claude.ai/artifact/Nk3VEkdQBLZX3MzXMRdTzQ · Read [NOTES.md](NOTES.md) before shipping anything.

## Stack ($0)
Next.js (static export) · Firebase Spark (Auth + Firestore) · Cloudflare Pages (+ Pages Functions for Gemini)
· Stockfish WASM · chess.js · react-chessboard · Chess.com public API · Gemini free tier

## Local setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Firebase web config.
3. `npm run dev` → http://localhost:3000

## Deploy (Cloudflare Pages)
Connect the GitHub repo in Cloudflare Pages: build command `npm run build`, output directory `out`,
and add the `NEXT_PUBLIC_FIREBASE_*` variables plus the `GEMINI_API_KEY` secret.

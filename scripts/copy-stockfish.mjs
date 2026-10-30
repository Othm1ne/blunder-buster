// Copies the Stockfish engine (lite, single-threaded: ~1.7 MB, no special headers needed) into /public
// so the browser can load it as a Web Worker. Runs automatically on install, dev and build.
// Stockfish is GPL: see NOTES.md before selling.
import { copyFileSync, mkdirSync } from "node:fs";

const files = ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"];
mkdirSync("public/stockfish", { recursive: true });
for (const f of files) copyFileSync(`node_modules/stockfish/bin/${f}`, `public/stockfish/${f}`);
console.log("Stockfish copied to public/stockfish");

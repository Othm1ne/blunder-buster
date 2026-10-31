// Builds public/data/openings.json from the Lichess opening list (CC0 / public domain):
// https://github.com/lichess-org/chess-openings
// Maps every position reached in a known opening line to the opening's name
// ("" for positions in the middle of a line that have no name of their own).
// Run manually when you want fresh data: node scripts/build-openings.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";

const BASE = "https://raw.githubusercontent.com/lichess-org/chess-openings/master";
const epd = (fen) => fen.split(" ").slice(0, 4).join(" ");

const book = {};
for (const file of ["a", "b", "c", "d", "e"]) {
  const tsv = await (await fetch(`${BASE}/${file}.tsv`)).text();
  for (const row of tsv.trim().split("\n").slice(1)) {
    const [, name, pgn] = row.split("\t");
    const chess = new Chess();
    const sans = pgn.replace(/\d+\.(\.\.)?/g, " ").trim().split(/\s+/);
    sans.forEach((san, i) => {
      chess.move(san);
      const key = epd(chess.fen());
      if (i === sans.length - 1) book[key] = name; // named position
      else book[key] ??= ""; // passed through on the way
    });
  }
}

mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/openings.json", JSON.stringify(book));
console.log(`${Object.keys(book).length} book positions written to public/data/openings.json`);

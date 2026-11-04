import type { MetadataRoute } from "next";

// Makes Blunder Buster installable ("Add to Home screen" / the install button in the address bar).
// Static: generated once at build time, like the rest of the site.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Blunder Buster",
    short_name: "Blunder Buster",
    description: "Your fun chess coach that hunts down your blunders.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf3e4",
    theme_color: "#e8b86d",
    categories: ["games", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Puzzle warm-up", short_name: "Puzzles", url: "/puzzles", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Sync my games", short_name: "Games", url: "/games", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Train", short_name: "Train", url: "/train", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

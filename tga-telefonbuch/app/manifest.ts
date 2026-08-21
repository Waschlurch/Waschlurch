import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TGA Telefonbuch",
    short_name: "Telefonbuch",
    description: "Das zentrale Telefonbuch unseres Ingenieurbüros.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7fa",
    theme_color: "#ffffff",
    lang: "de",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

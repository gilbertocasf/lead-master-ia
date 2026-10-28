import type { MetadataRoute } from "next";

// Sistema interno: nenhum buscador deve indexar nada.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}

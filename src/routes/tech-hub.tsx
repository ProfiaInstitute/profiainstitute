import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { TechHubPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/tech-hub")({
  head: () =>
    seo(
      "Profia Tech Hub — Profia Institute",
      "Profia Tech Hub at Profia Institute, Homa Bay.",
      "/tech-hub",
    ),
  component: TechHubPage,
});

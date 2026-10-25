import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { TechHubPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/tech-hub")({
  head: () =>
    seo(
      "Technology and Digital Training — Profia Tech Hub Homa Bay",
      "Discover technology, digital learning and training opportunities at Profia Tech Hub, Profia Institute in Homa Bay.",
      "/tech-hub",
    ),
  component: TechHubPage,
});

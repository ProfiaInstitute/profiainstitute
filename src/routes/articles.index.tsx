import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { ArticlesPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/articles/")({
  head: () =>
    seo(
      "News & Updates — Profia Institute",
      "News & Updates at Profia Institute, Homa Bay.",
      "/articles/",
    ),
  component: ArticlesPage,
});

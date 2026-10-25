import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { ArticlesPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/articles/")({
  head: () =>
    seo(
      "News and Updates — Profia Institute Homa Bay",
      "Read news, student stories, training updates and announcements from Profia Institute in Homa Bay, Kenya.",
      "/articles/",
    ),
  component: ArticlesPage,
});

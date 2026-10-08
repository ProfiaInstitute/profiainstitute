import { createFileRoute } from "@tanstack/react-router";
import { ArticleDetailPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/articles/$slug")({
  head: () => ({
    meta: [
      { title: "Article — Profia Institute" },
      { name: "description", content: "News from Profia Institute." },
    ],
  }),
  component: ArticleDetailPage,
});

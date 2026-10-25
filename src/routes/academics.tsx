import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { AcademicsPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/academics")({
  head: () =>
    seo(
      "Courses and Academic Programmes — Profia Institute",
      "Explore academic programmes and professional courses at Profia Institute in Homa Bay, Kenya.",
      "/academics",
    ),
  component: AcademicsPage,
});

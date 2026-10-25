import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/hospitality")({
  head: () =>
    seo(
      "Hospitality Courses in Homa Bay — Profia Institute",
      "Explore hospitality training, professional courses and admission at Profia Institute in Homa Bay, Kenya.",
      "/hospitality",
    ),
  component: () => <SchoolPage slug="hospitality" whyTitle="Why Choose Profia Hospitality?" />,
});

import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/hospitality")({
  head: () =>
    seo(
      "TVET Hospitality Courses in Homa Bay | Profia Institute",
      "Study hospitality and food-service courses at Profia Institute, a Homa Bay TVET college. Explore published programmes, study options and admissions.",
      "/hospitality",
    ),
  component: () => (
    <SchoolPage
      slug="hospitality"
      whyTitle="Why Choose Profia Hospitality?"
      fallbackTitle="TVET Hospitality Courses"
      fallbackDescription="Explore hospitality training at Profia Institute in Homa Bay, including currently published programmes and study options."
    />
  ),
});

import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/engineering")({
  head: () =>
    seo(
      "TVET Engineering Courses in Homa Bay | Profia Institute",
      "Explore practical engineering and technical training at Profia Institute, a Homa Bay TVET college. View published courses and admission information.",
      "/engineering",
    ),
  component: () => (
    <SchoolPage
      slug="engineering"
      whyTitle="Why Choose Profia Engineering?"
      fallbackTitle="TVET Engineering Courses"
      fallbackDescription="Explore engineering and technical training at Profia Institute in Homa Bay. View current published programmes and admissions information."
    />
  ),
});

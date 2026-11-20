import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/cosmetology")({
  head: () =>
    seo(
      "TVET Beauty & Cosmetology Courses in Homa Bay | Profia Institute",
      "Explore beauty therapy, hairdressing and cosmetology training at Profia Institute in Homa Bay. View currently published courses and admissions information.",
      "/cosmetology",
    ),
  component: () => (
    <SchoolPage
      slug="cosmetology"
      whyTitle="Why Choose Profia Cosmetology?"
      fallbackTitle="TVET Beauty & Cosmetology Courses"
      fallbackDescription="Explore beauty and cosmetology training at Profia Institute in Homa Bay. View current published programmes and admissions information."
    />
  ),
});

import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";
import { KasnebQualifications } from "@/components/site/KasnebQualifications";

export const Route = createFileRoute("/business")({
  head: () =>
    seo(
      "KASNEB Exam Centre & Courses in Homa Bay | Profia Institute",
      "Profia Institute is an approved KASNEB examination centre and tuition provider in Homa Bay. Explore KASNEB, CPA and business programmes and contact admissions.",
      "/business",
    ),
  component: () => (
    <SchoolPage
      slug="business"
      whyTitle="Why Choose Our School of Business?"
      fallbackTitle="KASNEB Exam Centre & Courses in Homa Bay"
      fallbackDescription="Profia Institute is an approved KASNEB examination centre and tuition provider in Homa Bay. Explore KASNEB, CPA and business programmes and contact admissions for current details."
      contentAfterHero={<KasnebQualifications />}
    />
  ),
});

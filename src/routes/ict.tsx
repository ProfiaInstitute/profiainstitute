import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/ict")({
  head: () =>
    seo(
      "TVET ICT & Computer Courses in Homa Bay | Profia Institute",
      "Explore TVET information technology and computer training at Profia Institute in Homa Bay, Kenya. View current published programmes and application details.",
      "/ict",
    ),
  component: () => (
    <SchoolPage
      slug="ict"
      whyTitle="Why Choose Profia ICT?"
      fallbackTitle="TVET ICT & Computer Courses"
      fallbackDescription="Explore information technology and computer training at Profia Institute in Homa Bay. View current published programmes and contact admissions about entry requirements."
    />
  ),
});

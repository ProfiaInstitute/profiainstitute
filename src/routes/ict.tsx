import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/ict")({
  head: () => seo("School of ICT — Profia Institute", "Courses, fees and admission for the School of ICT at Profia Institute, Homa Bay.", "/ict"),
  component: () => <SchoolPage slug="ict" whyTitle="Why Choose Profia ICT?" />,
});

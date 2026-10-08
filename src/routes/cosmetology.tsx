import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/cosmetology")({
  head: () => seo("School of Beauty & Cosmetology — Profia Institute", "Courses, fees and admission for the School of Beauty & Cosmetology at Profia Institute, Homa Bay.", "/cosmetology"),
  component: () => <SchoolPage slug="cosmetology" whyTitle="Why Choose Profia Cosmetology?" />,
});

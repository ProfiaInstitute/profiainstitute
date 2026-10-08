import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/hospitality")({
  head: () => seo("School of Hospitality — Profia Institute", "Courses, fees and admission for the School of Hospitality at Profia Institute, Homa Bay.", "/hospitality"),
  component: () => <SchoolPage slug="hospitality" whyTitle="Why Choose Profia Hospitality?" />,
});

import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/business")({
  head: () => seo("School of Business — Profia Institute", "Courses, fees and admission for the School of Business at Profia Institute, Homa Bay.", "/business"),
  component: () => <SchoolPage slug="business" whyTitle="Why Choose Our School of Business?" />,
});

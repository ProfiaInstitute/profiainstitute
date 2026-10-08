import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/engineering")({
  head: () => seo("School of Engineering — Profia Institute", "Courses, fees and admission for the School of Engineering at Profia Institute, Homa Bay.", "/engineering"),
  component: () => <SchoolPage slug="engineering" whyTitle="Why Choose Profia Engineering?" />,
});

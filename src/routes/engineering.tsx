import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/engineering")({
  head: () =>
    seo(
      "Engineering Courses in Homa Bay — Profia Institute",
      "Explore engineering and technical training courses, admissions and study options at Profia Institute in Homa Bay.",
      "/engineering",
    ),
  component: () => <SchoolPage slug="engineering" whyTitle="Why Choose Profia Engineering?" />,
});

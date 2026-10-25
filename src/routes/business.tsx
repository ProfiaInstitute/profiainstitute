import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/business")({
  head: () =>
    seo(
      "Business Courses in Homa Bay — Profia Institute",
      "Explore business and professional courses, admission information and study opportunities at Profia Institute in Homa Bay.",
      "/business",
    ),
  component: () => <SchoolPage slug="business" whyTitle="Why Choose Our School of Business?" />,
});

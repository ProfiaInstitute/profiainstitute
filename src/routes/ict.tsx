import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/ict")({
  head: () =>
    seo(
      "ICT Courses in Homa Bay — Profia Institute",
      "Explore information technology and computer training courses at Profia Institute in Homa Bay, Kenya.",
      "/ict",
    ),
  component: () => <SchoolPage slug="ict" whyTitle="Why Choose Profia ICT?" />,
});

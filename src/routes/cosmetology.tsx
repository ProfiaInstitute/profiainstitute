import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { SchoolPage } from "@/components/site/SchoolPage";

export const Route = createFileRoute("/cosmetology")({
  head: () =>
    seo(
      "Beauty and Cosmetology Courses — Profia Institute Homa Bay",
      "Explore beauty and cosmetology training, admission information and courses at Profia Institute in Homa Bay, Kenya.",
      "/cosmetology",
    ),
  component: () => <SchoolPage slug="cosmetology" whyTitle="Why Choose Profia Cosmetology?" />,
});

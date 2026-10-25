import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { ContactPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/contact")({
  head: () =>
    seo(
      "Contact Profia Institute in Homa Bay, Kenya",
      "Contact Profia Institute for admissions and course enquiries. Visit our Homa Bay campus and get directions on the map.",
      "/contact",
    ),
  component: ContactPage,
});

import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { ContactPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/contact")({
  head: () =>
    seo("Contact Us — Profia Institute", "Contact Us at Profia Institute, Homa Bay.", "/contact"),
  component: ContactPage,
});

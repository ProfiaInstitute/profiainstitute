import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { AboutPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/about")({
  head: () =>
    seo("About Us — Profia Institute", "About Us at Profia Institute, Homa Bay.", "/about"),
  component: AboutPage,
});

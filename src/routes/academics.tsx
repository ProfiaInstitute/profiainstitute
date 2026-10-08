import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { AcademicsPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/academics")({
  head: () =>
    seo("Academics — Profia Institute", "Academics at Profia Institute, Homa Bay.", "/academics"),
  component: AcademicsPage,
});

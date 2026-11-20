import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { AcademicsPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/academics")({
  head: () =>
    seo(
      "TVET & KASNEB Courses in Homa Bay | Profia Institute",
      "Explore TVET and KASNEB courses at Profia Institute, an approved KASNEB examination centre in Homa Bay. Compare published programmes and application options.",
      "/academics",
    ),
  component: AcademicsPage,
});

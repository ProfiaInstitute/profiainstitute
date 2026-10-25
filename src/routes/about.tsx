import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { AboutPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/about")({
  head: () =>
    seo(
      "About Profia Institute — Professional Training in Homa Bay",
      "Learn about Profia Institute, our professional training, values and learning opportunities in Homa Bay, Kenya.",
      "/about",
    ),
  component: AboutPage,
});

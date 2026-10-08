import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { AnnouncementsPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/announcements")({
  head: () =>
    seo(
      "Announcements — Profia Institute",
      "Announcements at Profia Institute, Homa Bay.",
      "/announcements",
    ),
  component: AnnouncementsPage,
});

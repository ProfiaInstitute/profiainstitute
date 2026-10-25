import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { AnnouncementsPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/announcements")({
  head: () =>
    seo(
      "Institute Announcements — Profia Institute Homa Bay",
      "Read the latest admissions notices, events and official updates from Profia Institute in Homa Bay, Kenya.",
      "/announcements",
    ),
  component: AnnouncementsPage,
});

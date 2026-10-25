import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { OnlineCoursesPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/online-courses")({
  head: () =>
    seo(
      "Online Courses — Profia Institute",
      "Explore online learning and professional courses from Profia Institute, based in Homa Bay, Kenya.",
      "/online-courses",
    ),
  component: OnlineCoursesPage,
});

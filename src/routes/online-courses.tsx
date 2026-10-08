import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { OnlineCoursesPage } from "@/components/site/PublicPages";

export const Route = createFileRoute("/online-courses")({
  head: () =>
    seo(
      "Online Courses — Profia Institute",
      "Online Courses at Profia Institute, Homa Bay.",
      "/online-courses",
    ),
  component: OnlineCoursesPage,
});

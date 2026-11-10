import { createFileRoute } from "@tanstack/react-router";
import { HolidayProgramPage } from "@/components/site/HolidayProgramPage";
import { seo } from "@/lib/site";

export const Route = createFileRoute("/holiday-program")({
  head: () =>
    seo(
      "Holiday Computer Training — Profia Institute",
      "Apply for general or kids holiday computer training at Profia Institute in Homa Bay.",
      "/holiday-program",
    ),
  component: HolidayProgramPage,
});

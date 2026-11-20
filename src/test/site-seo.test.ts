import { describe, expect, it } from "vitest";
import { seo, SITE_URL } from "@/lib/site";

function metaContent(
  metadata: ReturnType<typeof seo>,
  selector: { name: string } | { property: string },
): string | undefined {
  return metadata.meta.find((tag) =>
    Object.entries(selector).every(([key, value]) => tag[key as keyof typeof tag] === value),
  )?.content;
}

describe("site SEO metadata", () => {
  it("sets canonical, social, and descriptive metadata for public pages", () => {
    const metadata = seo(
      "Contact Profia Institute",
      "Visit Profia Institute in Homa Bay.",
      "/contact",
    );

    expect(metadata.links).toContainEqual({
      rel: "canonical",
      href: `${SITE_URL}/contact`,
    });
    expect(metaContent(metadata, { name: "robots" })).toBe("index,follow");
    expect(metaContent(metadata, { name: "googlebot" })).toContain("max-image-preview:large");
    expect(metaContent(metadata, { property: "og:url" })).toBe(`${SITE_URL}/contact`);
    expect(metaContent(metadata, { name: "description" })).toBe(
      "Visit Profia Institute in Homa Bay.",
    );
  });

  it.each(["/admin", "/student", "/student?course=ict", "/facilitator", "/application-status"])(
    "keeps private pages out of search results (%s)",
    (path) => {
      const metadata = seo("Private page", "Private page description.", path);

      expect(metaContent(metadata, { name: "robots" })).toBe("noindex,nofollow");
      expect(metaContent(metadata, { name: "googlebot" })).toBe("noindex,nofollow");
    },
  );

  it("limits meta descriptions and normalizes canonical paths", () => {
    const metadata = seo("Page", "A".repeat(200), "contact");

    expect(metadata.links).toContainEqual({
      rel: "canonical",
      href: `${SITE_URL}/contact`,
    });
    expect(metaContent(metadata, { name: "description" })).toHaveLength(160);
  });
});

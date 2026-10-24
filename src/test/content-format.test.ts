import { describe, expect, it } from "vitest";
import { getYouTubeEmbedUrl, renderContentMarkup } from "@/lib/content-format";

describe("editorial content formatting", () => {
  it("renders supported formatting and safe links", () => {
    expect(
      renderContentMarkup(
        "# News\n\n**Important** and *useful*\n\n- One\n- Two\n\n[Visit](https://example.com)",
      ),
    ).toContain(
      '<h1>News</h1><p><strong>Important</strong> and <em>useful</em></p><ul><li>One</li><li>Two</li></ul><p><a href="https://example.com" rel="noopener noreferrer">Visit</a></p>',
    );
  });

  it("escapes HTML and removes unsafe link protocols", () => {
    const html = renderContentMarkup(
      '<img src=x onerror="alert(1)"> [unsafe](javascript:alert(1))',
    );
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("unsafe");
  });

  it("converts supported YouTube links to controllable embed URLs", () => {
    expect(getYouTubeEmbedUrl("https://www.youtube.com/watch?v=cBD1AgkM1VQ")).toBe(
      "https://www.youtube-nocookie.com/embed/cBD1AgkM1VQ?controls=1&playsinline=1",
    );
    expect(getYouTubeEmbedUrl("https://youtu.be/cBD1AgkM1VQ")).toBe(
      "https://www.youtube-nocookie.com/embed/cBD1AgkM1VQ?controls=1&playsinline=1",
    );
    expect(getYouTubeEmbedUrl("https://example.com/watch?v=cBD1AgkM1VQ")).toBeNull();
  });
});

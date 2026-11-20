import { describe, expect, it } from "vitest";
import {
  getGoogleBooksEmbedUrl,
  getGoogleBooksThumbnailUrl,
  getGoogleDriveEmbedUrl,
  getGoogleDriveThumbnailUrl,
  getYouTubeEmbedUrl,
  renderContentMarkup,
} from "@/lib/content-format";

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
      "https://www.youtube.com/embed/cBD1AgkM1VQ?controls=1&playsinline=1&vq=medium",
    );
    expect(getYouTubeEmbedUrl("https://youtu.be/cBD1AgkM1VQ")).toBe(
      "https://www.youtube.com/embed/cBD1AgkM1VQ?controls=1&playsinline=1&vq=medium",
    );
    expect(getYouTubeEmbedUrl("https://example.com/watch?v=cBD1AgkM1VQ")).toBeNull();
  });

  it("embeds Google Books and uses its cover image as the thumbnail", () => {
    const url = "https://books.google.com/books?id=sample-book";
    expect(getGoogleBooksEmbedUrl(url)).toBe(
      "https://books.google.com/books?id=sample-book&printsec=frontcover&output=embed",
    );
    expect(getGoogleBooksThumbnailUrl(url)).toContain(
      "https://books.google.com/books/content?id=sample-book",
    );
    expect(getGoogleBooksEmbedUrl("https://example.com/books?id=sample-book")).toBeNull();
  });

  it("embeds Google Drive material and generates a file thumbnail", () => {
    const url = "https://drive.google.com/file/d/sample_file-id/view";
    expect(getGoogleDriveEmbedUrl(url)).toBe(
      "https://drive.google.com/file/d/sample_file-id/preview",
    );
    expect(getGoogleDriveThumbnailUrl(url)).toBe(
      "https://drive.google.com/thumbnail?id=sample_file-id",
    );
    expect(getGoogleDriveEmbedUrl("https://example.com/file/d/sample-id")).toBeNull();
  });
});

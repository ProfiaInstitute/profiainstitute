function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function safeHref(value: string) {
  try {
    const url = new URL(value, "https://www.profiainstitute.com");
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

function renderInline(value: string) {
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_/g;
  let html = "";
  let offset = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    html += escapeHtml(value.slice(offset, index));
    if (match[1] !== undefined) {
      const href = safeHref(match[2] ?? "");
      html += href
        ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(match[1])}</a>`
        : escapeHtml(match[1]);
    } else if (match[3] !== undefined || match[4] !== undefined) {
      html += `<strong>${escapeHtml(match[3] ?? match[4] ?? "")}</strong>`;
    } else {
      html += `<em>${escapeHtml(match[5] ?? match[6] ?? "")}</em>`;
    }
    offset = index + match[0].length;
  }
  return html + escapeHtml(value.slice(offset));
}

export function renderContentMarkup(markdown: string) {
  const blocks = markdown.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const heading = lines.length === 1 ? /^(#{1,6})\s+(.+)$/.exec(lines[0] ?? "") : null;
      if (heading) {
        const level = heading[1]?.length ?? 2;
        return `<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`;
      }

      if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
        return `<ul>${lines
          .map((line) => `<li>${renderInline(line.replace(/^\s*[-*]\s+/, ""))}</li>`)
          .join("")}</ul>`;
      }
      if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
        return `<ol>${lines
          .map((line) => `<li>${renderInline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>`)
          .join("")}</ol>`;
      }
      return `<p>${lines.map(renderInline).join("<br>")}</p>`;
    })
    .join("");
}

export function getYouTubeEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId: string | null = null;

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v");
      else if (/^\/(embed|shorts|live)\//.test(url.pathname)) {
        videoId = url.pathname.split("/")[2] ?? null;
      }
    }

    if (!videoId || !/^[\w-]{11}$/.test(videoId)) return null;
    return `https://www.youtube.com/embed/${videoId}?controls=1&playsinline=1&vq=medium`;
  } catch {
    return null;
  }
}

export function getGoogleBooksEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "books.google.com") return null;
    const id = url.searchParams.get("id");
    if (!id || !/^[\w-]+$/.test(id)) return null;
    return `https://books.google.com/books?id=${encodeURIComponent(id)}&printsec=frontcover&output=embed`;
  } catch {
    return null;
  }
}

export function getGoogleBooksThumbnailUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "books.google.com") return null;
    const id = url.searchParams.get("id");
    if (!id || !/^[\w-]+$/.test(id)) return null;
    return `https://books.google.com/books/content?id=${encodeURIComponent(id)}&printsec=frontcover&img=1&zoom=1&source=gbs_api`;
  } catch {
    return null;
  }
}

function getGoogleDriveFileId(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "drive.google.com") return null;
    const id = url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? url.searchParams.get("id");
    return id && /^[\w-]+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function getGoogleDriveEmbedUrl(value: string) {
  const id = getGoogleDriveFileId(value);
  return id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview` : null;
}

export function getGoogleDriveThumbnailUrl(value: string) {
  const id = getGoogleDriveFileId(value);
  return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}` : null;
}

const BRAND_SUFFIX = " · shareable";

export function injectOverlay(
  html: Response,
  slug: string,
  version: number,
  docTitle: string,
): Response {
  const origin = "https://shareable.cdinnison.workers.dev";
  const displayTitle = (docTitle && docTitle.trim()) || "Untitled";
  const fullTitle = `${displayTitle}${BRAND_SUFFIX}`;
  const ogUrl = `${origin}/${slug}`;
  const ogImage = `${origin}/og/${slug}.png`;

  let sawTitle = false;

  const rewriter = new HTMLRewriter()
    .on("title", {
      element(el) {
        sawTitle = true;
        el.setInnerContent(fullTitle);
      },
    })
    .on("head", {
      element(el) {
        el.append(
          [
            `<link rel="icon" href="/_/favicon.svg" type="image/svg+xml">`,
            `<link rel="stylesheet" href="/_/overlay.css">`,
            `<meta property="og:title" content="${escapeAttr(fullTitle)}">`,
            `<meta property="og:type" content="article">`,
            `<meta property="og:url" content="${escapeAttr(ogUrl)}">`,
            `<meta property="og:image" content="${escapeAttr(ogImage)}">`,
            `<meta property="og:image:width" content="1200">`,
            `<meta property="og:image:height" content="630">`,
            `<meta property="og:site_name" content="shareable">`,
            `<meta name="twitter:card" content="summary_large_image">`,
            `<meta name="twitter:title" content="${escapeAttr(fullTitle)}">`,
            `<meta name="twitter:image" content="${escapeAttr(ogImage)}">`,
          ].join(""),
          { html: true },
        );
        el.onEndTag((end) => {
          if (!sawTitle) {
            end.before(`<title>${escapeText(fullTitle)}</title>`, { html: true });
          }
        });
      },
    })
    .on("body", {
      element(el) {
        el.append(
          `<script src="/_/overlay.js" data-slug="${slug}" data-version="${version}" defer></script>`,
          { html: true },
        );
      },
    });
  return rewriter.transform(html);
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

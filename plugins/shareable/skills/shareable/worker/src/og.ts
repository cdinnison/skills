import { ImageResponse, loadGoogleFont } from "workers-og";

const BG = "#fafaf9";
const FG = "#111111";
const MUTED = "#9ca3af";
const ACCENT = "#facc15";
const ACCENT_SOFT = "#fef3c7";

let interRegular: ArrayBuffer | null = null;
let interBold: ArrayBuffer | null = null;

async function loadFonts() {
  if (!interRegular) {
    interRegular = await loadGoogleFont({ family: "Inter", weight: 500 });
  }
  if (!interBold) {
    interBold = await loadGoogleFont({ family: "Inter", weight: 700 });
  }
  return { regular: interRegular, bold: interBold };
}

export async function renderOgImage(title: string, slug: string, host: string): Promise<Response> {
  const fonts = await loadFonts();
  const safe = escapeHtml(title);
  const shortSlug = slug.slice(0, 8);

  const html = `
<div style="display:flex; flex-direction:column; width:1200px; height:630px; background:${BG}; padding:72px 80px; box-sizing:border-box; font-family:Inter; position:relative;">
  <div style="display:flex; align-items:center; gap:14px;">
    <div style="display:flex; width:28px; height:28px; background:${ACCENT}; border-radius:6px;"></div>
    <div style="display:flex; font-size:22px; font-weight:700; color:${FG}; letter-spacing:-0.01em;">shareable</div>
  </div>

  <div style="display:flex; flex-direction:column; flex:1; justify-content:center; margin-top:24px;">
    <div style="display:flex; align-items:flex-start; gap:0;">
      <div style="display:flex; width:8px; align-self:stretch; background:${ACCENT}; margin-right:32px; border-radius:4px;"></div>
      <div style="display:flex; font-size:72px; font-weight:700; color:${FG}; line-height:1.08; letter-spacing:-0.025em; max-width:980px;">${safe}</div>
    </div>
  </div>

  <div style="display:flex; justify-content:space-between; align-items:center;">
    <div style="display:flex; font-size:20px; color:${MUTED}; font-family:Inter;">${host}</div>
    <div style="display:flex; background:${ACCENT_SOFT}; color:${FG}; font-size:18px; padding:8px 14px; border-radius:8px; letter-spacing:0.04em;">${shortSlug}</div>
  </div>
</div>`;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Inter", data: fonts.regular, weight: 500, style: "normal" },
      { name: "Inter", data: fonts.bold, weight: 700, style: "normal" },
    ],
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

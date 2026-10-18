export const LEGACY_HIGHLIGHTS = { blue: "#EFF6FF", amber: "#FFFBEB", orange: "#FFF7ED", indigo: "#EEF2FF", teal: "#F0FDFA", purple: "#FAF5FF" };
export const HIGHLIGHT_PALETTE = ["#FFFFFF", "#F1F5F9", "#E2E8F0", "#CBD5E1", "#FEE2E2", "#FFEDD5", "#FEF3C7", "#FEF9C3", "#ECFCCB", "#DCFCE7", "#D1FAE5", "#CCFBF1", "#CFFAFE", "#E0F2FE", "#DBEAFE", "#E0E7FF", "#EDE9FE", "#F3E8FF", "#FAE8FF", "#FCE7F3", "#FFE4E6", "#64748B", "#10345D", "#111111"];

export function normalizeHighlightColor(value) {
  if (typeof value !== "string") return null;
  const color = value.trim();
  if (Object.hasOwn(LEGACY_HIGHLIGHTS, color)) return color;
  if (/^#[\da-f]{3}$/i.test(color)) return `#${color.slice(1).split("").map((part) => part + part).join("")}`.toUpperCase();
  return /^#[\da-f]{6}$/i.test(color) ? color.toUpperCase() : null;
}

export function highlightStyle(value) {
  const color = normalizeHighlightColor(value);
  if (!color?.startsWith("#")) return undefined;
  const channels = color.slice(1).match(/../g).map((hex) => parseInt(hex, 16) / 255).map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return { backgroundColor: color, color: luminance > .179 ? "#111111" : "#FFFFFF" };
}

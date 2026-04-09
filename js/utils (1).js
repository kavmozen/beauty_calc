export function clamp(n, min, max) {
  const x = Number.isFinite(n) ? n : 0;
  return Math.min(max, Math.max(min, x));
}

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export function int(v, fallback = 0) {
  const n = typeof v === "number" ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function fmtRub(n) {
  const x = Math.round(num(n, NaN));
  if (!Number.isFinite(x)) return "—";
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽";
}

export function fmtSignedRub(n) {
  const x = num(n, NaN);
  if (!Number.isFinite(x)) return "—";
  const sign = x >= 0 ? "+" : "";
  return sign + fmtRub(x).replace(" ₽", "");
}

export function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

export function getEl(id) {
  return document.getElementById(id);
}

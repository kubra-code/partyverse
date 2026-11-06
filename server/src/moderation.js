// أضف الكلمات الممنوعة هنا (كلمة واحدة في كل عنصر)
const BAD = new Set(["fuck", "shit", "bitch", "asshole", "غبي", "حمار", "زبالة", "وسخ"]);

export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/(.)\1{2,}/gu, "$1");
}

export function checkText(text) {
  const words = normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.some((w) => BAD.has(w));
}
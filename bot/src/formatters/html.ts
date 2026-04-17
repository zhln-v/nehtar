const htmlSpecialChars: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string | number | bigint) {
  return value.toString().replace(/[&<>"']/g, (char) => htmlSpecialChars[char] ?? char);
}

export function htmlBold(value: string | number | bigint) {
  return `<b>${escapeHtml(value)}</b>`;
}

export function htmlCode(value: string | number | bigint) {
  return `<code>${escapeHtml(value)}</code>`;
}

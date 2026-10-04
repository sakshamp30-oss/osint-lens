/** Best-effort parse of a truncated JSON document, used to render streaming output live. */

function close(text: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of text) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = text;
  if (inStr) out += esc ? '\\"' : '"';
  out = out.replace(/[\s,]+$/, '');
  if (out.endsWith(':')) out += 'null';
  return out + stack.reverse().join('');
}

function lastStructuralComma(text: string): number {
  let inStr = false;
  let esc = false;
  let last = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === ',') last = i;
  }
  return last;
}

export function parsePartial<T = unknown>(src: string): T | null {
  let text = src.trim();
  if (!text) return null;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return JSON.parse(close(text)) as T;
    } catch {
      const cut = lastStructuralComma(text);
      if (cut < 0) return null;
      text = text.slice(0, cut);
    }
  }
  return null;
}

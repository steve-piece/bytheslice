// mod/jsonc.ts
// Pure JSONC reader shared by the verdict parser and the policy loader: strips comments and trailing commas outside strings.

/**
 * Strips `//` and `/* *\/` comments outside strings, then trailing commas, so
 * `JSON.parse` reads JSONC (a verifier's verdict, `bytheslice.config.json`).
 */
export function stripJsonc(text: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? ''
    const next = text[i + 1] ?? ''
    if (inString) {
      out += ch
      if (ch === '\\') {
        out += next
        i += 1
      } else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
    } else if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
      out += '\n'
    } else if (ch === '/' && next === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1
      i += 1
    } else out += ch
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

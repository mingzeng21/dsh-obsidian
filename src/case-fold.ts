export function foldCase(value: string): string {
  // ripgrep uses Unicode simple case folding. JavaScript lowercasing expands
  // characters such as U+0130 into multiple code points, which is full-case
  // behavior and does not match ripgrep's simple folding. Keep expansions
  // intact, while folding single-code-point upper/lower pairs (including
  // Greek final sigma and the Greek symbol variants).
  return [...value].map((char) => {
    const codePoint = char.codePointAt(0) ?? 0
    const cherokeeFold = cherokeeCaseFold(codePoint)
    if (cherokeeFold !== null) return String.fromCodePoint(cherokeeFold)
    const lower = char.toLowerCase()
    if ([...lower].length !== 1) return char
    const upperLower = char.toUpperCase().toLowerCase()
    if (char !== '\u0131' && [...upperLower].length === 1) return upperLower
    return lower
  }).join('')
}

function cherokeeCaseFold(codePoint: number): number | null {
  if (codePoint >= 0x13a0 && codePoint <= 0x13f5) return codePoint
  if (codePoint >= 0x13f8 && codePoint <= 0x13fd) return codePoint - 8
  if (codePoint >= 0xab70 && codePoint <= 0xabbf) return codePoint - 0x97d0
  return null
}

export function includesFolded(text: string, query: string): boolean {
  return foldCase(text).includes(foldCase(query))
}

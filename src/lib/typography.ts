const HANGING_WORDS_RE =
  /(^|[\s(\u00A0«"'])(в|во|к|ко|с|со|у|о|об|и|а|но|да|на|по|из|за|от|до|не|ни|бы|ли|же|или|под|над|при|про|без|для|как|что|это|все|ещё|из-за|через) +/giu;

const BEFORE_PUNCT_RE = / +(—|–|·|→|▾)/gu;
const AFTER_DOT_RE = /(·) +/gu;
const TRAILING_SHORT_WORD_RE = / +([0-9]+%?|[а-яёa-z₽%]{1,4}[.!?»)]?)$/iu;

/**
 * Binds Russian prepositions, conjunctions, particles, mid-dots, em-dashes,
 * and short trailing words with non-breaking spaces so lines never end on a
 * hanging short word or punctuation mark.
 */
export function bindRussianTypography(input: string): string {
  if (!input || !input.includes(' ')) return input;
  let result = input;
  // Run twice so chains like «и не» or «по России и не» bind both words
  result = result.replace(HANGING_WORDS_RE, '$1$2\u00A0');
  result = result.replace(HANGING_WORDS_RE, '$1$2\u00A0');
  result = result.replace(BEFORE_PUNCT_RE, '\u00A0$1');
  result = result.replace(AFTER_DOT_RE, '$1\u00A0');
  result = result.replace(TRAILING_SHORT_WORD_RE, '\u00A0$1');
  return result;
}

/**
 * Walks all text nodes inside `root` and applies non-breaking space typography.
 */
export function applyTypographyToSubtree(root: Node): void {
  const doc = root.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const parentTag = current.parentElement?.tagName;
    if (parentTag !== 'SCRIPT' && parentTag !== 'STYLE' && parentTag !== 'TEXTAREA') {
      const original = current.nodeValue ?? '';
      const bound = bindRussianTypography(original);
      if (bound !== original) {
        current.nodeValue = bound;
      }
    }
    current = walker.nextNode();
  }
}

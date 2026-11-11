const HANGING_WORDS_RE =
  /(^|[\s(\u00A0«"'])(в|во|к|ко|с|со|у|о|об|обо|и|а|но|да|то|так|уж|вот|ну|на|по|из|за|от|до|не|ни|бы|ли|же|их|её|ее|мы|вы|или|либо|под|над|при|про|без|для|как|что|это|все|всё|ещё|уже|если|чтобы|из-за|через) +/giu;

const SHORT_WORD_RE = /(^|[\s(\u00A0«"'])([а-яё]{1,2}) +/giu;
const BEFORE_PUNCT_RE = / +(—|–|·|→|▾)/gu;
const SPACE_BEFORE_PUNCT_RE = / +([.,;:!?…])/gu;
const AFTER_DOT_RE = /(·) +/gu;
const TRAILING_SHORT_WORD_RE = / +([0-9]+%?|[а-яёa-z₽%]{1,4}[.!?»)]?)$/iu;
const SLASH_UNIT_RE = /([а-яё₽%0-9])\/([а-яё0-9])/giu;

/** Copy attributes that can show a hanging word or a space before punctuation. */
export const TYPOGRAPHY_ATTRIBUTES = ['aria-label', 'aria-description', 'placeholder', 'title', 'alt'] as const;

/**
 * Binds Russian prepositions, conjunctions, particles, mid-dots, em-dashes,
 * short trailing words with non-breaking spaces, and unit slashes («₽/мес»)
 * with word-joiners (U+2060) so lines never break mid-unit or leave hanging words.
 */
export function bindRussianTypography(input: string): string {
  if (!input) return input;
  let result = input;
  if (result.includes('/')) {
    result = result.replace(SLASH_UNIT_RE, '$1\u2060/\u2060$2');
  }
  if (!result.includes(' ')) return result;
  // A space before a comma or a dot is a typo («Таблица .CSV», «цифра ,»), not a pause.
  result = result.replace(SPACE_BEFORE_PUNCT_RE, '$1');
  if (!result.includes(' ')) return result;
  // Run twice so chains like «и не» or «по России и не» bind both words.
  result = result.replace(HANGING_WORDS_RE, '$1$2\u00A0');
  result = result.replace(HANGING_WORDS_RE, '$1$2\u00A0');
  result = result.replace(SHORT_WORD_RE, '$1$2\u00A0');
  result = result.replace(SHORT_WORD_RE, '$1$2\u00A0');
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
  if (root instanceof Element) bindTypographyAttributes(root);
}

function bindTypographyAttributes(root: Element): void {
  const elements = [root, ...root.querySelectorAll('*')];
  for (const element of elements) {
    for (const name of TYPOGRAPHY_ATTRIBUTES) {
      const original = element.getAttribute(name);
      if (!original) continue;
      const bound = bindRussianTypography(original);
      if (bound !== original) element.setAttribute(name, bound);
    }
  }
}

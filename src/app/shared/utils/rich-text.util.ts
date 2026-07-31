/**
 * Zengin metin (soru gövdesi) için izin listesi tabanlı temizleyici.
 *
 * Editör `contenteditable` kullandığı için kullanıcı yapıştırma yoluyla rastgele
 * HTML getirebilir. Angular şablonda `[innerHTML]`'i zaten sanitize eder; burada
 * ek olarak **kaydedilen** veri de temizlenir: veritabanına script, stil veya
 * olay özniteliği hiç girmez (savunmanın iki katmanı).
 *
 * Saf fonksiyonlardır — hem istemci editörü hem mock sunucu doğrulaması kullanır.
 */

/** İzin verilen etiketler — biçimlendirme ve görsel ile sınırlı. */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'p',
  'br',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  'blockquote',
  'sub',
  'sup',
  'h3',
  'h4',
  'img',
  'a',
]);

/** Etiket başına izin verilen öznitelikler. Diğerleri (onclick, style…) düşer. */
const ALLOWED_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  img: ['src', 'alt'],
  a: ['href', 'target', 'rel'],
};

const SAFE_URL = /^(https?:|data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,)/i;

/**
 * HTML'i izin listesine göre temizler.
 *
 * Tarayıcı dışında (test/sunucu tarafı) `DOMParser` bulunmayabilir; bu durumda
 * etiketler tamamen sökülüp düz metne düşülür — sessizce ham HTML saklanmaz.
 */
export function sanitizeRichText(html: string): string {
  if (typeof DOMParser === 'undefined') return stripTags(html);

  const document_ = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  clean(document_.body);
  return document_.body.innerHTML.trim();
}

function clean(node: Element): void {
  // Canlı koleksiyonla yürümemek için önce kopya alınır.
  for (const child of [...node.children]) {
    const tag = child.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      // Etiket düşer, içeriği korunur — kullanıcı yazdığı metni kaybetmez.
      child.replaceWith(...[...child.childNodes]);
      continue;
    }

    const allowed = ALLOWED_ATTRIBUTES[tag] ?? [];
    for (const attribute of [...child.attributes]) {
      const name = attribute.name.toLowerCase();
      const unsafeUrl =
        (name === 'src' || name === 'href') && !SAFE_URL.test(attribute.value.trim());

      if (!allowed.includes(name) || unsafeUrl) child.removeAttribute(attribute.name);
    }

    // Dış bağlantılar sekme kaçırma saldırısına karşı korunur.
    if (tag === 'a' && child.getAttribute('href')) {
      child.setAttribute('target', '_blank');
      child.setAttribute('rel', 'noopener noreferrer');
    }

    clean(child);
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/** Karakter sayacı ve uzunluk doğrulaması için düz metin uzunluğu. */
export function richTextLength(html: string): number {
  return toPlainText(html).length;
}

/** HTML'i düz metne çevirir — arama indeksinde ve özet gösteriminde kullanılır. */
export function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|li|h3|h4|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

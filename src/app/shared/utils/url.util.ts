/**
 * Bağlantı doğrulaması.
 *
 * İstemci form validator'ı ile sunucu (mock) alan doğrulaması AYNI fonksiyonu
 * kullanır; iki taraf farklı karar veremez (PROJECT_RULES.md §5).
 *
 * Yalnızca mutlak `http`/`https` adresleri kabul edilir — `javascript:` gibi
 * şemalar ve göreli yollar reddedilir.
 */
export function isHttpUrl(value: string): boolean {
  const text = value.trim();
  if (text.length === 0) return false;

  try {
    const url = new URL(text);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

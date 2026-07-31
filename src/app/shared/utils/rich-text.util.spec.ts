import { describe, expect, it } from 'vitest';

import { richTextLength, sanitizeRichText, toPlainText } from './rich-text.util';

describe('sanitizeRichText', () => {
  it('izin verilen biçimlendirmeyi korur', () => {
    const html = '<p>Merhaba <strong>dünya</strong></p>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it('script etiketini içeriğiyle birlikte etkisizleştirir', () => {
    const result = sanitizeRichText('<p>Metin</p><script>alert(1)</script>');
    expect(result).not.toContain('<script');
  });

  it('olay özniteliklerini siler', () => {
    const result = sanitizeRichText('<p onclick="steal()">Metin</p>');
    expect(result).toBe('<p>Metin</p>');
  });

  it('stil özniteliğini siler', () => {
    const result = sanitizeRichText('<p style="position:fixed">Metin</p>');
    expect(result).toBe('<p>Metin</p>');
  });

  it('izin verilmeyen etiketi düşürür ama metni korur', () => {
    expect(sanitizeRichText('<marquee>Kayan</marquee>')).toBe('Kayan');
  });

  it('güvenli görsel adresini korur', () => {
    const result = sanitizeRichText('<img src="https://cdn.test/a.png" alt="a">');
    expect(result).toContain('src="https://cdn.test/a.png"');
    expect(result).toContain('alt="a"');
  });

  it('javascript: şemasını reddeder', () => {
    const result = sanitizeRichText('<a href="javascript:alert(1)">Tık</a>');
    expect(result).not.toContain('javascript:');
  });

  it('dış bağlantıya güvenlik öznitelikleri ekler', () => {
    const result = sanitizeRichText('<a href="https://ornek.dev">Kaynak</a>');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('target="_blank"');
  });
});

describe('toPlainText / richTextLength', () => {
  it('etiketleri kaldırır ve boşlukları sadeleştirir', () => {
    expect(toPlainText('<p>Bir</p>  <p>iki</p>')).toBe('Bir iki');
  });

  it('HTML varlıklarını çözer', () => {
    expect(toPlainText('<p>A &amp; B</p>')).toBe('A & B');
  });

  it('uzunluğu etiketleri saymadan ölçer', () => {
    // "Merhaba" = 7 karakter; etiketler sayılmaz.
    expect(richTextLength('<p><strong>Merhaba</strong></p>')).toBe(7);
  });

  it('boş gövdede sıfır döner', () => {
    expect(richTextLength('<p></p>')).toBe(0);
  });
});

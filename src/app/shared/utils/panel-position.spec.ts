import { describe, expect, it } from 'vitest';

import { placePanel } from './panel-position';

const VIEWPORT = { width: 1280, height: 800 };

function input(overrides: Partial<Parameters<typeof placePanel>[0]> = {}) {
  return {
    trigger: { top: 100, bottom: 136, left: 200, right: 320 },
    viewport: VIEWPORT,
    panelWidth: 240,
    panelHeight: 280,
    ...overrides,
  };
}

describe('placePanel', () => {
  it('yer varken aşağı açar', () => {
    const placement = placePanel(input());

    expect(placement.flipped).toBe(false);
    expect(placement.top).toBe(140);
    expect(placement.left).toBe(200);
  });

  it('aşağıda yer yoksa ve yukarıda daha çok yer varsa yukarı açar', () => {
    const placement = placePanel(
      input({ trigger: { top: 700, bottom: 736, left: 200, right: 320 } }),
    );

    expect(placement.flipped).toBe(true);
    // Panel tetikleyicinin üstüne, aradaki boşluk kadar mesafeyle oturur.
    expect(placement.top).toBe(700 - 4 - 280);
  });

  it('iki taraf da dar olduğunda geniş olanı seçer', () => {
    const placement = placePanel(
      input({
        trigger: { top: 300, bottom: 336, left: 200, right: 320 },
        viewport: { width: 1280, height: 500 },
      }),
    );

    // Aşağıda 152 px, yukarıda 288 px yer var → yukarı açılır.
    expect(placement.flipped).toBe(true);
    expect(placement.maxHeight).toBe(288);
  });

  it('yukarıda daha az yer varsa aşağıda kalır ve yüksekliği kısılır', () => {
    const placement = placePanel(
      input({
        trigger: { top: 60, bottom: 96, left: 200, right: 320 },
        viewport: { width: 1280, height: 300 },
      }),
    );

    // Aşağıda 192 px, yukarıda 48 px yer var → aşağıda kalır, yüksekliği kısılır.
    expect(placement.flipped).toBe(false);
    expect(placement.maxHeight).toBe(192);
    expect(placement.maxHeight).toBeLessThan(280);
  });

  it('kısa görünüm alanında yüksekliği asla negatif vermez', () => {
    const placement = placePanel(
      input({
        trigger: { top: 380, bottom: 400, left: 200, right: 320 },
        viewport: { width: 1280, height: 400 },
      }),
    );

    expect(placement.maxHeight).toBeGreaterThanOrEqual(0);
  });

  it('sağ kenardan taşan paneli içeri çeker', () => {
    const placement = placePanel(
      input({ trigger: { top: 100, bottom: 136, left: 1200, right: 1270 } }),
    );

    expect(placement.left).toBe(1280 - 240 - 8);
  });

  it('sol kenarın dışına çıkmaz', () => {
    const placement = placePanel(
      input({ trigger: { top: 100, bottom: 136, left: -50, right: 70 } }),
    );

    expect(placement.left).toBe(8);
  });

  it('ekrandan geniş panelde bile sol payı korur', () => {
    const placement = placePanel(
      input({ panelWidth: 2000, trigger: { top: 100, bottom: 136, left: 400, right: 520 } }),
    );

    expect(placement.left).toBe(8);
  });
});

/**
 * Açılır panel konumlandırma (filtre menüsü, aksiyon menüsü, çoklu seçim).
 *
 * Paneller `position: fixed` ile yerleştirilir. `absolute` kullanıldığında iki
 * ayrı sorun çıkıyordu:
 *
 * · Tablo satırındaki aksiyon menüsü, tablonun kaydırma kabının
 *   (`overflow: auto`) dışına taşamadığı için KIRPILIYORDU.
 * · Uzun bir menü (20 dersli "Ders" filtresi) tetikleyici sayfanın altlarındaysa
 *   ekranın dışına taşıyor, kullanıcı seçeneklerin çoğunu göremiyordu.
 *
 * `fixed` her iki kısıtı da aşar; karşılığında konumun elle hesaplanması ve
 * kaydırmada tazelenmesi gerekir — bu dosya o hesabı tek yerde tutar.
 *
 * Saf fonksiyonlardır: DOM okumaz, ölçüleri parametre olarak alır.
 */

/** Panelin yerleşeceği dikdörtgen. */
export interface PanelPlacement {
  readonly top: number;
  readonly left: number;
  /** Kullanılabilir alana göre kırpılmış yükseklik; panel bunu aşamaz. */
  readonly maxHeight: number;
  /** Panel tetikleyicinin üstüne mi açıldı — animasyon yönü için. */
  readonly flipped: boolean;
}

export interface PanelInput {
  /** Tetikleyicinin görünüm alanına göre konumu. */
  readonly trigger: { top: number; bottom: number; left: number; right: number };
  readonly viewport: { width: number; height: number };
  readonly panelWidth: number;
  /** Panelin doğal yüksekliği (içeriğe göre). */
  readonly panelHeight: number;
}

/** Tetikleyici ile panel arasındaki boşluk. */
const GAP = 4;

/** Panelin ekran kenarına bırakacağı asgari pay. */
const EDGE_PADDING = 8;

/**
 * Panelin altta mı üstte mi açılacağına ve ne kadar yükseleceğine karar verir.
 *
 * Varsayılan yön AŞAĞIDIR; yukarı açmak yalnızca aşağıda yer kalmadığında ve
 * yukarıda daha fazla yer olduğunda tercih edilir. Kullanıcı menülerin aşağı
 * açılmasını bekler, her seferinde yön değiştirmek şaşırtıcı olurdu.
 */
export function placePanel(input: PanelInput): PanelPlacement {
  const { trigger, viewport, panelWidth, panelHeight } = input;

  const spaceBelow = viewport.height - trigger.bottom - GAP - EDGE_PADDING;
  const spaceAbove = trigger.top - GAP - EDGE_PADDING;

  const flipped = panelHeight > spaceBelow && spaceAbove > spaceBelow;
  const available = Math.max(flipped ? spaceAbove : spaceBelow, 0);
  const height = Math.min(panelHeight, available);

  const top = flipped ? trigger.top - GAP - height : trigger.bottom + GAP;

  return {
    top: Math.round(top),
    left: Math.round(clampHorizontally(trigger.left, panelWidth, viewport.width)),
    maxHeight: Math.round(available),
    flipped,
  };
}

/**
 * Yatay taşmayı engeller.
 *
 * Panel tetikleyicinin sol kenarıyla hizalanır; sağ kenardan taşıyorsa sağa
 * yaslanır. Ekrandan dar bir panel hiçbir zaman sol kenarın dışına çıkmaz.
 */
function clampHorizontally(left: number, panelWidth: number, viewportWidth: number): number {
  const maxLeft = viewportWidth - panelWidth - EDGE_PADDING;
  return Math.max(EDGE_PADDING, Math.min(left, maxLeft));
}

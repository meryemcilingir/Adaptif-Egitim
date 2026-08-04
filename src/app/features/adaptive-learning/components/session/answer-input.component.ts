import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AnswerValue, SessionQuestionView } from '../../models/exam-session.model';

/**
 * Cevap girişi.
 *
 * Hangi giriş biçiminin çizileceği sorunun `answerKind` alanından gelir; bileşen
 * soru TÜRÜNE göre dallanmaz (ADR-034 ile aynı ilke). Yeni bir tür eklemek,
 * kayıt tablosuna bir satır ve buraya bir `@case` bloğu eklemekten ibarettir.
 *
 * Değer dışarıdan verilir ve değişiklik dışarı yayılır (kontrollü bileşen):
 * cevabın tek kaynağı facade'dir, bileşen kendi kopyasını tutmaz.
 */
@Component({
  selector: 'app-answer-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  templateUrl: './answer-input.component.html',
  styleUrl: './answer-input.component.scss',
})
export class AnswerInputComponent {
  readonly question = input.required<SessionQuestionView>();
  readonly value = input.required<AnswerValue | null>();
  readonly disabled = input(false);

  readonly valueChange = output<AnswerValue>();

  /* ── Seçenekli ─────────────────────────────────────────────────────────── */

  readonly selectedOptionIds = computed<readonly string[]>(() => {
    const value = this.value();
    return value?.kind === 'choice' ? value.optionIds : [];
  });

  isSelected(optionId: string): boolean {
    return this.selectedOptionIds().includes(optionId);
  }

  /**
   * Seçenek işaretleme.
   *
   * Tek doğrulu sorularda yeni seçim öncekinin yerini alır; çok doğrulularda
   * işaret açılıp kapanır. Aynı seçeneğe tekrar tıklamak tek doğrulu soruda
   * seçimi KALDIRMAZ — öğrencinin yanlışlıkla cevabını boşaltmasını önler.
   */
  toggleOption(optionId: string): void {
    if (this.disabled()) return;

    const current = this.selectedOptionIds();

    if (!this.question().multipleCorrect) {
      this.valueChange.emit({ kind: 'choice', optionIds: [optionId] });
      return;
    }

    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];

    this.valueChange.emit({ kind: 'choice', optionIds: next });
  }

  /* ── Doğru / yanlış ────────────────────────────────────────────────────── */

  readonly booleanValue = computed<boolean | null>(() => {
    const value = this.value();
    return value?.kind === 'boolean' ? value.value : null;
  });

  setBoolean(value: boolean): void {
    if (this.disabled()) return;
    this.valueChange.emit({ kind: 'boolean', value });
  }

  /* ── Sayısal ───────────────────────────────────────────────────────────── */

  readonly numericValue = computed<string>(() => {
    const value = this.value();
    return value?.kind === 'numeric' && value.value !== null ? String(value.value) : '';
  });

  onNumeric(raw: string): void {
    if (this.disabled()) return;

    const trimmed = raw.trim();
    const parsed = trimmed === '' ? null : Number(trimmed.replace(',', '.'));

    // Geçersiz giriş cevabı BOZMAZ; kullanıcı yazmaya devam edebilsin diye
    // yalnızca sayıya çevrilebilen değerler yayılır.
    if (parsed !== null && Number.isNaN(parsed)) return;

    this.valueChange.emit({ kind: 'numeric', value: parsed });
  }

  /* ── Metin ─────────────────────────────────────────────────────────────── */

  readonly textValue = computed<string>(() => {
    const value = this.value();
    return value?.kind === 'text' ? value.value : '';
  });

  /** Açık uçlu cevaplarda sınır: kaçak uzun metinler sunucuya gitmemeli. */
  readonly textLimit = 4000;

  readonly textRemaining = computed(() => this.textLimit - this.textValue().length);

  onText(raw: string): void {
    if (this.disabled()) return;
    this.valueChange.emit({ kind: 'text', value: raw.slice(0, this.textLimit) });
  }

  /* ── Eşleştirme ────────────────────────────────────────────────────────── */

  matchValueFor(leftId: string): string {
    const value = this.value();
    if (value?.kind !== 'pairs') return '';
    return value.pairs.find((pair) => pair.leftId === leftId)?.rightId ?? '';
  }

  setMatch(leftId: string, rightId: string): void {
    if (this.disabled()) return;

    const value = this.value();
    const current = value?.kind === 'pairs' ? value.pairs : [];
    const without = current.filter((pair) => pair.leftId !== leftId);

    const next = rightId ? [...without, { leftId, rightId }] : without;
    this.valueChange.emit({ kind: 'pairs', pairs: next });
  }

  /* ── Sıralama ──────────────────────────────────────────────────────────── */

  /**
   * Öğrencinin verdiği sıra.
   *
   * Henüz dokunulmamışsa sunucudan gelen (karıştırılmış) sıra gösterilir;
   * boş liste göstermek öğrenciyi "önce bir şey seçmeliyim" sanısına düşürürdü.
   */
  readonly sequenceOrder = computed<readonly { id: string; text: string }[]>(() => {
    const items = this.question().sequenceItems;
    const value = this.value();

    if (value?.kind !== 'sequence' || value.itemIds.length === 0) return items;

    const byId = new Map(items.map((item) => [item.id, item]));
    const ordered = value.itemIds
      .map((id) => byId.get(id))
      .filter((item): item is { id: string; text: string } => item !== undefined);

    // Listeye sonradan eklenen öğeler kaybolmasın.
    const seen = new Set(ordered.map((item) => item.id));
    return [...ordered, ...items.filter((item) => !seen.has(item.id))];
  });

  moveSequence(index: number, delta: number): void {
    if (this.disabled()) return;

    const items = [...this.sequenceOrder()];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;

    [items[index], items[target]] = [items[target], items[index]];
    this.valueChange.emit({ kind: 'sequence', itemIds: items.map((item) => item.id) });
  }

  /** Seçenek harfi: A, B, C … */
  letterOf(index: number): string {
    return String.fromCharCode(65 + index);
  }
}

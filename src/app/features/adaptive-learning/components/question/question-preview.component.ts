import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppIconName } from '../../../../shared/icons/app-icons';
import { QUESTION_TYPE_META, Question } from '../../models/question.model';

/**
 * Soru önizlemesi — öğrencinin göreceği hâle yakın gösterim.
 *
 * Hangi cevap bloğunun çizileceği `answerShape` üzerinden seçilir; tür adına
 * göre dallanma yoktur. Yeni bir tür eklendiğinde yalnızca yeni bir şekil
 * bloğu eklenir, mevcut kod değişmez (Open/Closed).
 *
 * `showAnswers` kapalıyken doğru cevaplar gizlenir — öğrenci gözüyle bakılır.
 */
@Component({
  selector: 'app-question-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  templateUrl: './question-preview.component.html',
  styleUrl: './question-preview.component.scss',
})
export class QuestionPreviewComponent {
  readonly question = input.required<Question>();
  /** Doğru cevaplar ve gerekçeler gösterilsin mi. */
  readonly showAnswers = input(true);

  readonly meta = computed(() => QUESTION_TYPE_META[this.question().type]);
  readonly shape = computed(() => this.meta().answerShape);

  /** Sıralama sorusunda öğeler doğru sıraya dizilerek gösterilir. */
  readonly orderedItems = computed(() =>
    [...this.question().sequenceItems].sort((a, b) => a.order - b.order),
  );

  readonly attachmentIcon = (kind: string): AppIconName => (kind === 'image' ? 'image' : 'link');

  /** Seçenek işaretleyicisi: tekli seçimde daire, çoklu seçimde kare. */
  readonly optionMarker = computed<AppIconName>(() =>
    this.meta().multipleCorrect ? 'square-check' : 'circle-check',
  );
}

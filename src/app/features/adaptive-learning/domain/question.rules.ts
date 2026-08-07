import { COGNITIVE_LEVEL_LABELS, DIFFICULTY_LABELS } from '../models/common.model';
import { BadgeTone } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { AppIconName } from '../../../shared/icons/app-icons';
import {
  QUESTION_LIMITS,
  QUESTION_TYPE_META,
  Question,
  QuestionReviewStatus,
  QuestionState,
  QuestionType,
  QuestionVersion,
  VersionComparison,
  VersionFieldDiff,
} from '../models/question.model';
import { label as stateLabel } from './publish-workflow';

/**
 * Soru bankasının saf iş kuralları.
 *
 * Cevap yapısı doğrulaması ve versiyon karşılaştırması burada, Angular'sız
 * fonksiyonlar olarak durur; hem mock backend hem istemci formu AYNI kuralları
 * çağırır (BR-02, BR-34). Doğrudan test edilir.
 */

/* ── Cevap yapısı doğrulaması ────────────────────────────────────────────── */

export interface AnswerIssue {
  /** Formda hangi alanın altında gösterileceği. */
  readonly field: string;
  readonly message: string;
}

/**
 * Sorunun cevap yapısı türüne uygun mu?
 *
 * Kural tablosundan (`QUESTION_TYPE_META.answerShape`) türetilir; tür adına göre
 * dallanma yoktur, yeni tür eklemek bu fonksiyonu değiştirmez.
 */
export function validateAnswerShape(question: {
  readonly type: QuestionType;
  readonly options: readonly { readonly text: string; readonly correct: boolean }[];
  readonly matchPairs: readonly { readonly left: string; readonly right: string }[];
  readonly sequenceItems: readonly { readonly text: string; readonly order: number }[];
  readonly expectedAnswer: string | null;
}): AnswerIssue[] {
  const meta = QUESTION_TYPE_META[question.type];
  const issues: AnswerIssue[] = [];

  switch (meta.answerShape) {
    case 'options': {
      const filled = question.options.filter((option) => option.text.trim().length > 0);
      if (filled.length < meta.minOptions) {
        issues.push({
          field: 'options',
          message: `Bu soru türü için en az ${meta.minOptions} seçenek girilmelidir.`,
        });
        break;
      }
      if (filled.length > meta.maxOptions) {
        issues.push({
          field: 'options',
          message: `Bu soru türü için en fazla ${meta.maxOptions} seçenek girilebilir.`,
        });
      }

      const correct = filled.filter((option) => option.correct).length;
      if (correct === 0) {
        issues.push({ field: 'options', message: 'En az bir seçenek doğru işaretlenmelidir.' });
      } else if (!meta.multipleCorrect && correct > 1) {
        issues.push({
          field: 'options',
          message: 'Bu soru türünde yalnızca bir seçenek doğru olabilir.',
        });
      } else if (meta.multipleCorrect && correct === filled.length) {
        issues.push({
          field: 'options',
          message: 'Tüm seçenekler doğru işaretlenemez; en az bir çeldirici bulunmalıdır.',
        });
      }
      break;
    }

    case 'numeric':
      if (!isFiniteNumber(question.expectedAnswer)) {
        issues.push({ field: 'expectedAnswer', message: 'Beklenen cevap sayısal olmalıdır.' });
      }
      break;

    case 'text':
      if ((question.expectedAnswer ?? '').trim().length === 0) {
        issues.push({
          field: 'expectedAnswer',
          message: 'Kısa cevap sorularında örnek cevap girilmelidir.',
        });
      }
      break;

    case 'pairs': {
      const filled = question.matchPairs.filter(
        (pair) => pair.left.trim().length > 0 && pair.right.trim().length > 0,
      );
      if (filled.length < QUESTION_LIMITS.pairCount.min) {
        issues.push({
          field: 'matchPairs',
          message: `Eşleştirme sorusunda en az ${QUESTION_LIMITS.pairCount.min} eşleşme tanımlanmalıdır.`,
        });
      }
      if (filled.length > QUESTION_LIMITS.pairCount.max) {
        issues.push({
          field: 'matchPairs',
          message: `En fazla ${QUESTION_LIMITS.pairCount.max} eşleşme tanımlanabilir.`,
        });
      }
      break;
    }

    case 'sequence': {
      const filled = question.sequenceItems.filter((item) => item.text.trim().length > 0);
      if (filled.length < QUESTION_LIMITS.sequenceCount.min) {
        issues.push({
          field: 'sequenceItems',
          message: `Sıralama sorusunda en az ${QUESTION_LIMITS.sequenceCount.min} öğe bulunmalıdır.`,
        });
        break;
      }
      if (filled.length > QUESTION_LIMITS.sequenceCount.max) {
        issues.push({
          field: 'sequenceItems',
          message: `En fazla ${QUESTION_LIMITS.sequenceCount.max} öğe tanımlanabilir.`,
        });
        break;
      }

      // Sıra numaraları 1..n aralığında ve benzersiz olmalıdır.
      const orders = [...filled].map((item) => item.order).sort((a, b) => a - b);
      const valid = orders.every((order, index) => order === index + 1);
      if (!valid) {
        issues.push({
          field: 'sequenceItems',
          message: 'Sıra numaraları 1’den başlayarak birer artmalı ve tekrar etmemelidir.',
        });
      }
      break;
    }

    // Açık uçlu soruda otomatik cevap anahtarı aranmaz; rubrikle değerlendirilir.
    case 'manual':
      break;
  }

  return issues;
}

function isFiniteNumber(value: string | null): boolean {
  if (value === null || value.trim().length === 0) return false;
  return Number.isFinite(Number(value));
}

/* ── Düzenlenebilirlik ───────────────────────────────────────────────────── */

/**
 * Yalnızca Taslak ve Revizyon İstendi durumundaki soru eğitmen tarafından
 * düzenlenebilir. İncelemede/Onaylandı durumları KİLİTLİDİR — eğitmen soruyu
 * incelemeye gönderdikten sonra ölçme uzmanı karar verene kadar değiştiremez
 * (aksi hâlde inceleyen kişi güncel olmayan bir hâli değerlendirmiş olurdu).
 * Yayındaki ve arşivdeki soru da doğrudan düzenlenemez (BR-02); değiştirmek
 * için `POST /questions/:id/versions` ile yeni versiyon açılır.
 */
export function isQuestionEditable(
  state: QuestionState,
  reviewStatus: QuestionReviewStatus = 'NONE',
): boolean {
  if (state === 'DRAFT') return true;
  if (state !== 'REVIEW') return false;
  return reviewStatus === 'REVISION_REQUESTED';
}

/** Onaylanmış bir soru, yayınlanana kadar kilitlidir — ne eğitmen ne ölçme uzmanı düzenleyebilir. */
export function isQuestionLocked(state: QuestionState, reviewStatus: QuestionReviewStatus): boolean {
  return state === 'REVIEW' && (reviewStatus === 'UNDER_REVIEW' || reviewStatus === 'APPROVED');
}

/** Yeni versiyon yalnızca yayınlanmış bir soru için anlamlıdır. */
export function canCreateNewVersion(state: Question['state']): boolean {
  return state === 'PUBLISHED';
}

export function questionEditBlockedReason(
  state: QuestionState,
  reviewStatus: QuestionReviewStatus = 'NONE',
): string {
  if (state === 'REVIEW' && reviewStatus === 'UNDER_REVIEW') {
    return 'Bu soru şu anda incelemede; ölçme uzmanı karar verene kadar düzenlenemez.';
  }
  if (state === 'REVIEW' && reviewStatus === 'APPROVED') {
    return 'Bu soru onaylandı ve yayına hazır; değişiklik için önce yayınlanıp yeni versiyon açılmalıdır.';
  }
  return `"${stateLabel(state)}" durumundaki bir soru doğrudan düzenlenemez. Değişiklik için yeni bir versiyon oluşturun.`;
}

/* ── İnceleme durumu görünümü ────────────────────────────────────────────── */

export interface QuestionStatusPresentation {
  readonly label: string;
  readonly tone: BadgeTone;
  readonly icon: AppIconName;
}

/**
 * Sorunun altı görünür durumu (Draft/Under Review/Revision Requested/Approved/
 * Published/Archived) burada `state` + `reviewStatus` çiftinden türetilir.
 * Bu ikisi TEK bir görünür rozete indirgenir — ekranlar ham enum çifti görmez.
 */
export function questionStatusPresentation(
  state: QuestionState,
  reviewStatus: QuestionReviewStatus,
): QuestionStatusPresentation {
  if (state === 'REVIEW') {
    switch (reviewStatus) {
      case 'REVISION_REQUESTED':
        return { label: 'Revizyon istendi', tone: 'warning', icon: 'circle-alert' };
      case 'APPROVED':
        return { label: 'Onaylandı', tone: 'primary', icon: 'circle-check' };
      case 'UNDER_REVIEW':
      case 'NONE':
      default:
        return { label: 'İncelemede', tone: 'info', icon: 'eye' };
    }
  }

  switch (state) {
    case 'DRAFT':
      return { label: 'Taslak', tone: 'neutral', icon: 'pencil-line' };
    case 'PUBLISHED':
      return { label: 'Yayında', tone: 'success', icon: 'circle-check-big' };
    case 'ARCHIVED':
      return { label: 'Arşiv', tone: 'neutral', icon: 'archive' };
  }
}

/** Eğitmen soruyu incelemeye gönderebilir mi — yalnızca taslakken. */
export function canSubmitForReview(state: QuestionState): boolean {
  return state === 'DRAFT';
}

/** Revizyon istenmiş bir soru, düzeltildikten sonra yeniden incelemeye gönderilebilir. */
export function canResubmitForReview(
  state: QuestionState,
  reviewStatus: QuestionReviewStatus,
): boolean {
  return state === 'REVIEW' && reviewStatus === 'REVISION_REQUESTED';
}

/** Ölçme uzmanı yalnızca fiilen incelemedeki bir soru için karar verebilir. */
export function canDecideReview(state: QuestionState, reviewStatus: QuestionReviewStatus): boolean {
  return state === 'REVIEW' && reviewStatus === 'UNDER_REVIEW';
}

/** Yayına almadan önce soru onaylanmış olmalıdır (Approved → Published). */
export function canPublishQuestion(state: QuestionState, reviewStatus: QuestionReviewStatus): boolean {
  return state === 'REVIEW' && reviewStatus === 'APPROVED';
}

/* ── Versiyon karşılaştırma ──────────────────────────────────────────────── */

type Snapshot = QuestionVersion['snapshot'];

/** Karşılaştırılan alanlar ve okunabilir değere çevrimleri — tek tablo. */
const COMPARED_FIELDS: readonly {
  readonly field: keyof Snapshot & string;
  readonly label: string;
  readonly isRichText?: boolean;
  readonly format?: (snapshot: Snapshot) => string;
}[] = [
  { field: 'title', label: 'Başlık' },
  { field: 'stem', label: 'Soru gövdesi', isRichText: true },
  { field: 'explanation', label: 'Açıklama' },
  {
    field: 'type',
    label: 'Soru türü',
    format: (snapshot) => QUESTION_TYPE_META[snapshot.type].label,
  },
  {
    field: 'difficulty',
    label: 'Zorluk',
    format: (snapshot) => DIFFICULTY_LABELS[snapshot.difficulty],
  },
  {
    field: 'level',
    label: 'Bloom seviyesi',
    format: (snapshot) => COGNITIVE_LEVEL_LABELS[snapshot.level],
  },
  { field: 'points', label: 'Puan', format: (snapshot) => String(snapshot.points) },
  {
    field: 'estimatedSolveTimeSeconds',
    label: 'Tahmini çözüm süresi',
    format: (snapshot) => `${snapshot.estimatedSolveTimeSeconds} sn`,
  },
  {
    field: 'options',
    label: 'Seçenekler',
    format: (snapshot) =>
      snapshot.options.map((option) => `${option.correct ? '✓' : '·'} ${option.text}`).join('\n'),
  },
  {
    field: 'matchPairs',
    label: 'Eşleşmeler',
    format: (snapshot) =>
      snapshot.matchPairs.map((pair) => `${pair.left} → ${pair.right}`).join('\n'),
  },
  {
    field: 'sequenceItems',
    label: 'Sıralama',
    format: (snapshot) =>
      [...snapshot.sequenceItems]
        .sort((a, b) => a.order - b.order)
        .map((item) => `${item.order}. ${item.text}`)
        .join('\n'),
  },
  {
    field: 'expectedAnswer',
    label: 'Beklenen cevap',
    format: (snapshot) => snapshot.expectedAnswer ?? '—',
  },
  { field: 'tags', label: 'Etiketler', format: (snapshot) => snapshot.tags.join(', ') || '—' },
  {
    field: 'outcomeIds',
    label: 'Kazanım sayısı',
    format: (snapshot) => String(snapshot.outcomeIds.length),
  },
  {
    field: 'attachments',
    label: 'Ek sayısı',
    format: (snapshot) => String(snapshot.attachments.length),
  },
  { field: 'state', label: 'Durum', format: (snapshot) => stateLabel(snapshot.state) },
];

/**
 * İki versiyonu karşılaştırır ve YALNIZCA değişen alanları döndürür.
 *
 * Kazanım kimlikleri gibi teknik alanlar okunabilir değerlere çevrilir; kullanıcı
 * "Medium → Hard" gibi anlamlı bir fark görür, ham kimlik görmez.
 */
export function compareVersions(from: QuestionVersion, to: QuestionVersion): VersionComparison {
  const changes: VersionFieldDiff[] = [];

  for (const entry of COMPARED_FIELDS) {
    const before = entry.format
      ? entry.format(from.snapshot)
      : String(from.snapshot[entry.field] ?? '');
    const after = entry.format ? entry.format(to.snapshot) : String(to.snapshot[entry.field] ?? '');

    if (before === after) continue;

    changes.push({
      field: entry.field,
      label: entry.label,
      before,
      after,
      isRichText: entry.isRichText ?? false,
    });
  }

  return {
    questionId: to.questionId,
    fromVersion: from.versionNumber,
    toVersion: to.versionNumber,
    fromUpdatedBy: from.publishedByName,
    toUpdatedBy: to.publishedByName,
    fromUpdatedAt: from.publishedAt,
    toUpdatedAt: to.publishedAt,
    changes,
  };
}

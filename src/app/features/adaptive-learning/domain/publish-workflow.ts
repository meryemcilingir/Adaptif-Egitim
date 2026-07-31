import { PublishState } from '../models/common.model';

/**
 * Yayın durum makinesi (BR-21).
 *
 * Program, ders ve kazanım AYNI iş akışını paylaşır:
 *
 *   Draft ──► Review ──► Published ──► Archived
 *     ▲         │                          │
 *     └─────────┘                          │
 *     └────────────── restore ─────────────┘
 *
 * Saf fonksiyonlardan oluşur (Angular/HTTP bağımlılığı yok) → doğrudan test edilir
 * ve hem istemci hem mock backend tarafından kullanılır. Böylece "geçerli geçiş"
 * tanımı tek bir yerde durur; iki taraf ayrışamaz.
 */

export const PUBLISH_TRANSITIONS: Readonly<Record<PublishState, readonly PublishState[]>> = {
  DRAFT: ['REVIEW'],
  // İncelemeden geri çekme veya yayına alma.
  REVIEW: ['DRAFT', 'PUBLISHED'],
  PUBLISHED: ['ARCHIVED'],
  // Arşivden geri alma: kayıt taslak olarak canlanır, doğrudan yayına dönmez.
  ARCHIVED: ['DRAFT'],
};

/** Geçişi tetikleyen kullanıcı eylemi — buton etiketleri ve onay metinleri buradan gelir. */
export interface PublishAction {
  readonly target: PublishState;
  readonly label: string;
  readonly description: string;
  readonly icon: 'arrow-right' | 'circle-check-big' | 'lock' | 'refresh-cw' | 'pencil-line';
  readonly tone: 'primary' | 'success' | 'warning' | 'danger' | 'secondary';
  /** Yıkıcı/geri dönüşü zor eylemlerde onay diyaloğu açılır. */
  readonly requiresConfirmation: boolean;
}

const ACTIONS: Readonly<
  Record<PublishState, Readonly<Partial<Record<PublishState, PublishAction>>>>
> = {
  DRAFT: {
    REVIEW: {
      target: 'REVIEW',
      label: 'İncelemeye gönder',
      description: 'Kayıt yayın onayı için incelemeye alınır.',
      icon: 'arrow-right',
      tone: 'primary',
      requiresConfirmation: false,
    },
  },
  REVIEW: {
    DRAFT: {
      target: 'DRAFT',
      label: 'Taslağa geri al',
      description: 'Kayıt incelemeden çıkarılır ve yeniden düzenlenebilir hâle gelir.',
      icon: 'pencil-line',
      tone: 'secondary',
      requiresConfirmation: false,
    },
    PUBLISHED: {
      target: 'PUBLISHED',
      label: 'Yayınla',
      description: 'Kayıt yayına alınır ve ilgili rollerin erişimine açılır.',
      icon: 'circle-check-big',
      tone: 'success',
      requiresConfirmation: true,
    },
  },
  PUBLISHED: {
    ARCHIVED: {
      target: 'ARCHIVED',
      label: 'Arşivle',
      description: 'Kayıt yayından kaldırılır; geçmiş veriler korunur.',
      icon: 'lock',
      tone: 'warning',
      requiresConfirmation: true,
    },
  },
  ARCHIVED: {
    DRAFT: {
      target: 'DRAFT',
      label: 'Arşivden çıkar',
      description: 'Kayıt taslak durumuna döner ve yeniden düzenlenebilir.',
      icon: 'refresh-cw',
      tone: 'secondary',
      requiresConfirmation: false,
    },
  },
};

export function canTransition(from: PublishState, to: PublishState): boolean {
  return PUBLISH_TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: PublishState): readonly PublishState[] {
  return PUBLISH_TRANSITIONS[from];
}

/** Bir durumdan çıkan tüm kullanıcı eylemleri (arayüz butonları bunları render eder). */
export function availableActions(from: PublishState): readonly PublishAction[] {
  return allowedTransitions(from)
    .map((target) => ACTIONS[from][target])
    .filter((action): action is PublishAction => action !== undefined);
}

export function actionFor(from: PublishState, to: PublishState): PublishAction | null {
  return ACTIONS[from][to] ?? null;
}

/** Yalnızca taslak kayıtlar serbestçe düzenlenebilir; yayındaki kayıt korunur. */
export function isEditable(state: PublishState): boolean {
  return state === 'DRAFT' || state === 'REVIEW';
}

/** Silme yalnızca hiç yayınlanmamış taslaklarda serbesttir; gerisi arşivlenir. */
export function isDeletable(state: PublishState): boolean {
  return state === 'DRAFT';
}

/** Geçersiz geçiş denemesinde kullanıcıya gösterilecek açıklayıcı mesaj. */
export function transitionError(from: PublishState, to: PublishState): string {
  const allowed = allowedTransitions(from);
  if (allowed.length === 0) {
    return `"${label(from)}" durumundaki bir kayıt için başka bir duruma geçiş tanımlı değil.`;
  }
  return `"${label(from)}" durumundan "${label(to)}" durumuna geçilemez. İzin verilen geçişler: ${allowed
    .map(label)
    .join(', ')}.`;
}

const LABELS: Readonly<Record<PublishState, string>> = {
  DRAFT: 'Taslak',
  REVIEW: 'İncelemede',
  PUBLISHED: 'Yayında',
  ARCHIVED: 'Arşiv',
};

export function label(state: PublishState): string {
  return LABELS[state];
}

/**
 * Akademik dönem kuralları (Sprint 9 §5).
 *
 * Dönem, platformdaki neredeyse her kaydın zaman çıpasıdır: sınav takvimi,
 * cohort ataması ve raporların "bu dönem" tanımı buradan gelir. Bu yüzden
 * kurallar tek bir yerde ve saf fonksiyonlarda durur — hem istemci formu hem
 * mock sunucu AYNI doğrulamayı çağırır, ikisi ayrışamaz.
 *
 * "Şimdi" her zaman parametredir; hiçbir fonksiyon `Date.now()` okumaz.
 */

export const SEMESTERS = ['FALL', 'SPRING', 'SUMMER'] as const;
export type Semester = (typeof SEMESTERS)[number];

export const SEMESTER_LABELS: Readonly<Record<Semester, string>> = {
  FALL: 'Güz',
  SPRING: 'Bahar',
  SUMMER: 'Yaz',
};

export const TERM_STATUSES = ['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export type TermStatus = (typeof TERM_STATUSES)[number];

export const TERM_STATUS_LABELS: Readonly<Record<TermStatus, string>> = {
  UPCOMING: 'Yaklaşan',
  ACTIVE: 'Aktif',
  COMPLETED: 'Tamamlandı',
  ARCHIVED: 'Arşiv',
};

/** Doğrulamaya giren dönem — kayıtlı da olabilir, henüz kaydedilmemiş de. */
export interface TermInput {
  readonly id: string | null;
  readonly academicYear: string;
  readonly semester: Semester;
  readonly startDate: string;
  readonly endDate: string;
}

/** Çakışma kontrolü için var olan dönemler. */
export interface TermRecord {
  readonly id: string;
  readonly academicYear: string;
  readonly semester: Semester;
  readonly startDate: string;
  readonly endDate: string;
  readonly archivedAt: string | null;
}

export interface TermViolation {
  readonly field: 'academicYear' | 'semester' | 'startDate' | 'endDate' | 'form';
  readonly message: string;
}

export const TERM_LIMITS = {
  /** Bir dönem en az bir hafta sürer; daha kısası takvim değil, yazım hatasıdır. */
  minDays: 7,
  /** Bir akademik dönem bir yılı aşamaz. */
  maxDays: 366,
} as const;

/** `2025-2026` biçimi: ardışık iki yıl. */
const ACADEMIC_YEAR_PATTERN = /^(\d{4})-(\d{4})$/;

/**
 * Akademik yıl biçimi.
 *
 * Yalnızca desen değil, ANLAM da doğrulanır: `2025-2030` desene uyar ama
 * akademik yıl değildir. İkinci yıl birincinin bir fazlası olmalıdır.
 */
export function validateAcademicYear(value: string): TermViolation | null {
  const match = ACADEMIC_YEAR_PATTERN.exec(value.trim());

  if (!match) {
    return {
      field: 'academicYear',
      message: 'Akademik yıl `2025-2026` biçiminde olmalıdır.',
    };
  }

  const first = Number(match[1]);
  const second = Number(match[2]);

  if (second !== first + 1) {
    return {
      field: 'academicYear',
      message: 'Akademik yıl ardışık iki yıldan oluşmalıdır (ör. 2025-2026).',
    };
  }

  return null;
}

/**
 * Dönem doğrulaması.
 *
 * Tüm ihlaller birlikte döner; kullanıcıya hataları teker teker göstermek,
 * formu birkaç kez kaydetmeye çalıştırıp her seferinde yeni bir hata görmek
 * demek olurdu.
 */
export function validateTerm(
  input: TermInput,
  existing: readonly TermRecord[],
  nowMs: number,
): readonly TermViolation[] {
  const violations: TermViolation[] = [];

  const yearViolation = validateAcademicYear(input.academicYear);
  if (yearViolation) violations.push(yearViolation);

  const start = Date.parse(input.startDate);
  const end = Date.parse(input.endDate);

  if (Number.isNaN(start)) {
    violations.push({ field: 'startDate', message: 'Başlangıç tarihi geçersiz.' });
  }
  if (Number.isNaN(end)) {
    violations.push({ field: 'endDate', message: 'Bitiş tarihi geçersiz.' });
  }

  if (!Number.isNaN(start) && !Number.isNaN(end)) {
    if (end <= start) {
      violations.push({
        field: 'endDate',
        message: 'Bitiş tarihi başlangıçtan sonra olmalıdır.',
      });
    } else {
      const days = Math.round((end - start) / 86_400_000);

      if (days < TERM_LIMITS.minDays) {
        violations.push({
          field: 'endDate',
          message: `Dönem en az ${TERM_LIMITS.minDays} gün sürmelidir.`,
        });
      }
      if (days > TERM_LIMITS.maxDays) {
        violations.push({
          field: 'endDate',
          message: `Dönem en fazla ${TERM_LIMITS.maxDays} gün sürebilir.`,
        });
      }
    }

    const overlap = findOverlap(input, existing);
    if (overlap) {
      violations.push({
        field: 'form',
        message: `Tarihler "${termName(overlap)}" dönemiyle çakışıyor.`,
      });
    }
  }

  const duplicate = existing.find(
    (term) =>
      term.id !== input.id &&
      term.archivedAt === null &&
      term.academicYear === input.academicYear &&
      term.semester === input.semester,
  );

  if (duplicate) {
    violations.push({
      field: 'semester',
      message: `${termName(duplicate)} dönemi zaten tanımlı.`,
    });
  }

  // Geçmiş dönem düzenlenemez; kayıtlı bir dönemin bitişi geçtiyse form kapalıdır.
  const current = input.id === null ? null : existing.find((term) => term.id === input.id);
  if (current && isPast(current, nowMs)) {
    violations.push({
      field: 'form',
      message: 'Tamamlanmış dönem düzenlenemez. Yeni bir dönem oluşturun.',
    });
  }

  return violations;
}

/**
 * Çakışan dönem.
 *
 * Arşivlenmiş dönemler sayılmaz: arşiv, kaydın takvimden çekildiği anlamına
 * gelir; aynı tarihlere yeni bir dönem tanımlanabilmelidir.
 */
export function findOverlap(
  input: TermInput,
  existing: readonly TermRecord[],
): TermRecord | null {
  const start = Date.parse(input.startDate);
  const end = Date.parse(input.endDate);

  return (
    existing.find((term) => {
      if (term.id === input.id || term.archivedAt !== null) return false;

      const otherStart = Date.parse(term.startDate);
      const otherEnd = Date.parse(term.endDate);

      // Uçları paylaşan dönemler çakışır: bir gün iki döneme birden ait olamaz.
      return start <= otherEnd && end >= otherStart;
    }) ?? null
  );
}

/**
 * Dönem durumu TAKVİMDEN türetilir, saklanmaz.
 *
 * Saklansaydı, saat ilerledikçe kayıt kendiliğinden yanlışa düşerdi — bir
 * "aktif" dönem bittiği gün hâlâ aktif görünürdü (ADR-017 ile aynı ilke).
 * Arşiv ise gerçek bir karardır; o yüzden alandan okunur.
 */
export function termStatus(term: TermRecord, nowMs: number): TermStatus {
  if (term.archivedAt !== null) return 'ARCHIVED';

  const start = Date.parse(term.startDate);
  const end = Date.parse(term.endDate);

  if (nowMs < start) return 'UPCOMING';
  if (nowMs > end) return 'COMPLETED';

  return 'ACTIVE';
}

export function isPast(term: TermRecord, nowMs: number): boolean {
  return termStatus(term, nowMs) === 'COMPLETED';
}

export function isEditable(term: TermRecord, nowMs: number): boolean {
  const status = termStatus(term, nowMs);
  return status === 'UPCOMING' || status === 'ACTIVE';
}

/**
 * Aktif dönem.
 *
 * "Aynı anda yalnızca bir aktif dönem olabilir" kuralı bir BAYRAK ALANIYLA
 * değil, çakışma yasağıyla sağlanır: tarihleri çakışmayan dönemlerden ancak
 * biri bugünü kapsayabilir. Bayrak tutulsaydı iki kayıt birden aktif
 * işaretlenebilir ve tarihlerle çelişebilirdi.
 */
export function activeTerm(terms: readonly TermRecord[], nowMs: number): TermRecord | null {
  return terms.find((term) => termStatus(term, nowMs) === 'ACTIVE') ?? null;
}

export function termName(term: Pick<TermRecord, 'academicYear' | 'semester'>): string {
  return `${term.academicYear} ${SEMESTER_LABELS[term.semester]}`;
}

/** Dönemler takvim sırasına göre, en yeni önce. */
export function sortTerms(terms: readonly TermRecord[]): TermRecord[] {
  return [...terms].sort((a, b) => Date.parse(b.startDate) - Date.parse(a.startDate));
}

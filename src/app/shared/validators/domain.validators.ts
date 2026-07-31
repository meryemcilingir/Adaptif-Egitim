import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isHttpUrl } from '../utils/url.util';

/**
 * Yeniden kullanılabilir domain ve cross-field validator'ları.
 * Ekranlar kendi doğrulama mantığını yazmaz (PROJECT_RULES.md §5).
 */

/** Geçme puanı toplam puanı aşamaz. */
export function passingScoreWithinTotal(
  passingKey = 'passingScore',
  totalKey = 'totalPoints',
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const passing = Number(group.get(passingKey)?.value ?? 0);
    const total = Number(group.get(totalKey)?.value ?? 0);

    return passing > total ? { passingScoreTooHigh: { maxScore: total } } : null;
  };
}

/** Bitiş tarihi başlangıçtan önce olamaz. */
export function dateRangeValid(startKey = 'opensAt', endKey = 'closesAt'): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const start = Date.parse(String(group.get(startKey)?.value ?? ''));
    const end = Date.parse(String(group.get(endKey)?.value ?? ''));

    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    return end < start ? { dateRangeInvalid: true } : null;
  };
}

/** Rubrik seviyelerinin puanları artan sırada olmalıdır. */
export function rubricLevelsMonotonic(levelsKey = 'levels'): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const levels = group.get(levelsKey)?.value as { points: number }[] | null;
    if (!Array.isArray(levels) || levels.length < 2) return null;

    const ascending = levels.every(
      (level, index) => index === 0 || level.points > levels[index - 1]!.points,
    );
    return ascending ? null : { rubricLevelsNotMonotonic: true };
  };
}

/**
 * Etiket listesi — hem adet hem de tek etiket uzunluğu sınırlanır.
 * `Validators.maxLength` yalnızca adedi kontrol eder; etiket uzunluğu kaçardı.
 */
export function tagList(limits: { readonly max: number; readonly itemMax: number }): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const tags = control.value as readonly string[] | null;
    if (!Array.isArray(tags) || tags.length === 0) return null;

    if (tags.length > limits.max) return { maxTags: { max: limits.max } };
    if (tags.some((tag) => String(tag).trim().length > limits.itemMax)) {
      return { tagTooLong: { max: limits.itemMax } };
    }
    return null;
  };
}

/**
 * İsteğe bağlı bağlantı alanı — boş geçilebilir, doluysa http/https olmalıdır.
 * Sunucu tarafındaki `FieldValidator.url()` ile aynı `isHttpUrl` kuralını kullanır.
 */
export function httpUrl(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (value.length === 0) return null;
    return isHttpUrl(value) ? null : { httpUrl: true };
  };
}

/** Gerekçe alanı — sadece boşluk kabul edilmez. */
export function requiredReason(minLength = 10): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    return value.length >= minLength ? null : { reasonRequired: true };
  };
}

/**
 * Önkoşul döngüsü kontrolü (BR-01).
 *
 * Saf bir grafik işlemi olduğu için domain katmanındaki `detectCycle` ile aynı
 * mantığı paylaşır; burada yalnızca form sözleşmesine uyarlanır.
 */
export function noPrerequisiteCycle(
  outcomeId: string,
  prerequisitesOf: (id: string) => readonly string[],
  labelOf: (id: string) => string,
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const selected = (control.value ?? []) as readonly string[];

    for (const candidate of selected) {
      const path = findPath(candidate, outcomeId, prerequisitesOf);
      if (path) {
        return {
          prerequisiteCycle: {
            path: [outcomeId, ...path].map(labelOf).join(' → '),
          },
        };
      }
    }
    return null;
  };
}

/** `from` düğümünden `target` düğümüne giden yol varsa döndürür. */
function findPath(
  from: string,
  target: string,
  prerequisitesOf: (id: string) => readonly string[],
  visited = new Set<string>(),
): string[] | null {
  if (from === target) return [from];
  if (visited.has(from)) return null;

  visited.add(from);
  for (const next of prerequisitesOf(from)) {
    const path = findPath(next, target, prerequisitesOf, visited);
    if (path) return [from, ...path];
  }
  return null;
}

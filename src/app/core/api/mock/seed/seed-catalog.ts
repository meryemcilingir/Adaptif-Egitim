import {
  ContentItem,
  ContentProgress,
  ContentProgressState,
  ContentType,
} from '../../../../features/adaptive-learning/models/content-item.model';
import {
  COURSE_CATEGORIES,
  COURSE_LEVELS,
  Course,
} from '../../../../features/adaptive-learning/models/course.model';
import { LearningOutcome } from '../../../../features/adaptive-learning/models/learning-outcome.model';
import {
  DIFFICULTIES,
  PublishState,
} from '../../../../features/adaptive-learning/models/common.model';
import { MockUser } from '../db/db-schema';
import { COURSE_CATALOG } from './course-catalog';
import { OrganizationSeed } from './seed-organization';
import { SeedContext } from './seed-context';

export interface CatalogSeed {
  readonly courses: Course[];
  readonly outcomes: LearningOutcome[];
  readonly contents: ContentItem[];
  readonly contentProgress: ContentProgress[];
  readonly users: MockUser[];
}

const CONTENT_TITLE_PREFIX: Readonly<Record<ContentType, string>> = {
  video: 'Ders videosu',
  pdf: 'Ders notu (PDF)',
  presentation: 'Sunum',
  quiz: 'Kısa sınav',
  assignment: 'Ödev',
  external_link: 'Ek kaynak',
};

const CONTENT_DURATIONS: Readonly<Record<ContentType, readonly [number, number]>> = {
  video: [8, 24],
  pdf: [10, 30],
  presentation: [12, 25],
  quiz: [5, 15],
  assignment: [30, 90],
  external_link: [5, 20],
};

/**
 * Kazanım başına içerik kalıbı.
 *
 * Her kazanım en az bir anlatım + bir ölçme içeriği alır; böylece öğrenme yolu
 * (video → sunum/pdf → quiz → ödev) gerçekten kurulabilir. Bazı kazanımlara ek
 * kaynak ve ödev eklenir — liste ekranlarında tür çeşitliliği görünür.
 */
const CONTENT_PATTERNS: readonly (readonly ContentType[])[] = [
  ['video', 'pdf', 'quiz'],
  ['video', 'presentation', 'quiz', 'assignment'],
  ['presentation', 'pdf', 'quiz'],
  ['video', 'quiz', 'external_link'],
];

/** Ders başına atanan cohort sayısı — sınav katılımını gerçekçi seviyeye çıkarır. */
const COHORTS_PER_COURSE = 3;
/** Dersler ilk N eğitmene dağıtılır; böylece bir eğitmenin birden çok dersi olur. */
const TEACHING_INSTRUCTORS = 10;

/** Kazanım etiketleri — arama ve filtre demoları için gerçekçi bir havuz. */
const OUTCOME_TAG_POOL: readonly string[] = [
  'temel',
  'uygulama',
  'kavramsal',
  'problem-çözme',
  'modelleme',
  'analiz',
  'laboratuvar',
  'sınav-kritik',
  'ön-hazırlık',
  'ileri-seviye',
];

/**
 * Ders, kazanım ve içerik verisi.
 *
 * · Her ders bir eğitmene ve üç cohort'a bağlanır.
 * · Kazanımların çoğu PUBLISHED, bir kısmı bilinçli olarak DRAFT bırakılır —
 *   "yayınlanmamış bağlı kazanım" uyarısı demo edilebilsin diye.
 * · İçerikler kazanımlara bağlıdır ve bir kısmı önkoşul ustalığı gerektirir (BR-20).
 */
export function seedCatalog(ctx: SeedContext, organization: OrganizationSeed): CatalogSeed {
  const courses: Course[] = [];
  const outcomes: LearningOutcome[] = [];
  const contents: ContentItem[] = [];
  const instructorCourseMap = new Map<string, string[]>();

  const programByCode = new Map(
    organization.programs.map((program) => [program.code, program] as const),
  );

  COURSE_CATALOG.forEach((blueprint, courseIndex) => {
    const courseId = ctx.id('crs');
    const instructorId =
      organization.instructorIds[courseIndex % TEACHING_INSTRUCTORS] ??
      organization.instructorIds[0]!;
    const instructor = organization.users.find((user) => user.id === instructorId)!;

    const cohortIds = Array.from({ length: COHORTS_PER_COURSE }, (_, offset) => {
      const index = (courseIndex * COHORTS_PER_COURSE + offset) % organization.cohorts.length;
      return organization.cohorts[index]!.id;
    });

    // ── Kazanımlar ──────────────────────────────────────────────────────
    const outcomeIdsByIndex: string[] = [];

    blueprint.outcomes.forEach((outcomeBlueprint, outcomeIndex) => {
      const outcomeId = ctx.id('out');
      outcomeIdsByIndex.push(outcomeId);

      // Bazı derslerin son kazanımı taslak bırakılır → yayınlanmamış bağımlılık senaryosu.
      const state: PublishState =
        outcomeIndex === blueprint.outcomes.length - 1 && courseIndex % 4 === 0
          ? 'DRAFT'
          : 'PUBLISHED';

      outcomes.push({
        id: outcomeId,
        code: `${blueprint.code}.K${outcomeIndex + 1}`,
        title: outcomeBlueprint.title,
        description: outcomeBlueprint.description,
        courseId,
        level: outcomeBlueprint.level,
        // Bilişsel seviye ilerledikçe zorluk da artar — rastgele değil, tutarlı.
        difficulty:
          outcomeIndex < blueprint.outcomes.length / 3
            ? DIFFICULTIES[0]
            : outcomeIndex < (blueprint.outcomes.length * 2) / 3
              ? DIFFICULTIES[1]
              : DIFFICULTIES[2],
        estimatedDurationMinutes: ctx.rng.int(30, 240),
        tags: ctx.rng.sample(OUTCOME_TAG_POOL, ctx.rng.int(1, 4)),
        prerequisiteIds: outcomeBlueprint.prerequisites.map((index) => outcomeIdsByIndex[index]!),
        state,
        weight: ctx.rng.int(1, 5),
        questionCount: 0,
        contentCount: 0,
        publishedAt: state === 'PUBLISHED' ? ctx.date(-180 + courseIndex) : null,
        archivedAt: null,
        createdAt: ctx.date(-200 + courseIndex),
        updatedAt: ctx.pastDate(5, 60),
        version: ctx.rng.int(1, 4),
        createdBy: instructorId,
        updatedBy: instructorId,
      });
    });

    // ── İçerikler ───────────────────────────────────────────────────────
    outcomeIdsByIndex.forEach((outcomeId, outcomeIndex) => {
      const outcomeBlueprint = blueprint.outcomes[outcomeIndex]!;
      const outcomeCode = `${blueprint.code}.K${outcomeIndex + 1}`;
      const pattern = CONTENT_PATTERNS[(courseIndex + outcomeIndex) % CONTENT_PATTERNS.length]!;

      // Zorluk kazanımın seviyesini izler; kolay içerik her kazanımda bulunur ki
      // "başarısız değerlendirme → kolay içerik" kuralı hedefsiz kalmasın.
      pattern.forEach((type, typeIndex) => {
        const [minDuration, maxDuration] = CONTENT_DURATIONS[type];

        contents.push({
          id: ctx.id('cnt'),
          title: `${CONTENT_TITLE_PREFIX[type]}: ${outcomeBlueprint.title}`,
          description: `${outcomeBlueprint.description} Bu içerik ${outcomeCode} kazanımını hedefler.`,
          thumbnailUrl: null,
          type,
          courseId,
          outcomeId,
          difficulty:
            typeIndex === 0 ? 'easy' : typeIndex === pattern.length - 1 ? 'hard' : 'medium',
          level: outcomeBlueprint.level,
          estimatedDurationMinutes: ctx.rng.int(minDuration, maxDuration),
          tags: ctx.rng.sample(OUTCOME_TAG_POOL, ctx.rng.int(1, 3)),
          state: 'PUBLISHED',
          authorId: instructorId,
          authorName: instructor.fullName,
          resourceUrl:
            type === 'external_link'
              ? `https://kaynaklar.adaptif.dev/${outcomeCode.toLowerCase()}`
              : null,
          publishedAt: ctx.date(-170 + courseIndex),
          archivedAt: null,
          createdAt: ctx.date(-190 + courseIndex),
          updatedAt: ctx.pastDate(2, 40),
          version: 1,
          createdBy: instructorId,
          updatedBy: instructorId,
        });
      });
    });

    const courseOutcomes = outcomes.filter((outcome) => outcome.courseId === courseId);
    const courseContents = contents.filter((content) => content.courseId === courseId);
    const enrolled = organization.cohorts
      .filter((cohort) => cohortIds.includes(cohort.id))
      .reduce((total, cohort) => total + cohort.studentIds.length, 0);

    // Son iki ders yayın sürecinde bırakılır (durum makinesi demosu).
    const state: PublishState =
      courseIndex >= COURSE_CATALOG.length - 2
        ? courseIndex % 2 === 0
          ? 'REVIEW'
          : 'DRAFT'
        : 'PUBLISHED';

    courses.push({
      id: courseId,
      code: blueprint.code,
      name: blueprint.name,
      description: blueprint.description,
      programId: programByCode.get(blueprint.programCode)?.id ?? organization.programs[0]!.id,
      termId: organization.terms[1]!.id,
      instructorId,
      instructorName: instructor.fullName,
      cohortIds,
      category: COURSE_CATEGORIES[courseIndex % COURSE_CATEGORIES.length]!,
      level: COURSE_LEVELS[Math.floor(courseIndex / 7) % COURSE_LEVELS.length]!,
      estimatedDurationHours: ctx.rng.int(24, 96),
      state,
      outcomeCount: courseOutcomes.length,
      contentCount: courseContents.length,
      enrolledCount: enrolled,
      publishedAt: state === 'PUBLISHED' ? ctx.date(-150 + courseIndex) : null,
      archivedAt: null,
      color: blueprint.color,
      createdAt: ctx.date(-210 + courseIndex),
      updatedAt: ctx.pastDate(1, 30),
      version: ctx.rng.int(2, 6),
      createdBy: instructorId,
      updatedBy: instructorId,
    });

    instructorCourseMap.set(instructorId, [
      ...(instructorCourseMap.get(instructorId) ?? []),
      courseId,
    ]);
  });

  const withCounts = outcomes.map((outcome) => ({
    ...outcome,
    contentCount: contents.filter((content) => content.outcomeId === outcome.id).length,
  }));

  return {
    courses,
    outcomes: withCounts,
    contents,
    contentProgress: seedProgress(ctx, courses, contents, organization),
    users: attachCourseScope(organization.users, instructorCourseMap, courses),
  };
}

/**
 * Öğrencilerin içerik ilerlemesi.
 *
 * Yalnızca gerçekten dokunulmuş içerikler kaydedilir; `not_started` varsayılan
 * durumdur ve kayıt gerektirmez (`defaultProgress`). Bu, veri hacmini şişirmeden
 * gerçekçi bir ilerleme dağılımı sağlar.
 *
 * Tarihler son 45 güne yayılır ve öğrencilerin bir kısmı SON GÜNLERDE de çalışır —
 * böylece çalışma serisi ve haftalık grafik anlamlı veri gösterir.
 */
function seedProgress(
  ctx: SeedContext,
  courses: readonly Course[],
  contents: readonly ContentItem[],
  organization: OrganizationSeed,
): ContentProgress[] {
  const progress: ContentProgress[] = [];

  for (const course of courses) {
    const students = organization.cohorts
      .filter((cohort) => course.cohortIds.includes(cohort.id))
      .flatMap((cohort) => cohort.studentIds);

    const courseContents = contents.filter((content) => content.courseId === course.id);

    for (const studentId of students) {
      const completedRatio = ctx.rng.float(0.2, 0.8);
      // Öğrencilerin çoğu son günlerde de aktiftir; bir kısmı ara vermiştir.
      const isActive = ctx.rng.bool(0.7);

      courseContents.forEach((content, index) => {
        const ratio = index / Math.max(1, courseContents.length);
        const state: ContentProgressState =
          ratio < completedRatio
            ? 'completed'
            : ratio < completedRatio + 0.12
              ? 'in_progress'
              : 'not_started';

        if (state === 'not_started') return;

        const lastAccessedAt = isActive ? ctx.pastDate(0, 6) : ctx.pastDate(8, 45);
        const completionPercent = state === 'completed' ? 100 : ctx.rng.int(15, 85);

        progress.push({
          id: ctx.id('prg'),
          contentId: content.id,
          studentId,
          state,
          completionPercent,
          spentMinutes:
            state === 'completed'
              ? content.estimatedDurationMinutes
              : Math.round(content.estimatedDurationMinutes * (completionPercent / 100)),
          startedAt: lastAccessedAt,
          completedAt: state === 'completed' ? lastAccessedAt : null,
          lastAccessedAt,
          // Değerlendirme içeriklerinde puan tutulur; bir kısmı bilinçli olarak başarısızdır.
          scorePercent:
            state === 'completed' && (content.type === 'quiz' || content.type === 'assignment')
              ? ctx.rng.int(30, 100)
              : null,
        });
      });
    }
  }

  return progress;
}

/** Eğitmen ve öğrencilerin veri kapsamını (görebilecekleri dersler) hesaplar. */
function attachCourseScope(
  users: readonly MockUser[],
  instructorCourseMap: ReadonlyMap<string, string[]>,
  courses: readonly Course[],
): MockUser[] {
  const allCourseIds = courses.map((course) => course.id);

  return users.map((user) => {
    if (user.roles.includes('INSTRUCTOR')) {
      return { ...user, courseIds: instructorCourseMap.get(user.id) ?? [] };
    }
    if (user.roles.includes('STUDENT')) {
      const studentCourses = courses
        .filter((course) => course.cohortIds.some((id) => user.cohortIds.includes(id)))
        .map((course) => course.id);
      return { ...user, courseIds: studentCourses };
    }
    return { ...user, courseIds: allCourseIds };
  });
}

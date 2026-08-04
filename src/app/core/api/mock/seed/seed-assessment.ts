import {
  COGNITIVE_LEVELS,
  CognitiveLevel,
  Difficulty,
} from '../../../../features/adaptive-learning/models/common.model';
import { Course } from '../../../../features/adaptive-learning/models/course.model';
import { ExamBlueprint } from '../../../../features/adaptive-learning/models/blueprint.model';
import {
  Exam,
  ExamQuestionRef,
  ExamState,
} from '../../../../features/adaptive-learning/models/exam.model';
import { LearningOutcome } from '../../../../features/adaptive-learning/models/learning-outcome.model';
import {
  QUESTION_TYPE_META,
  Question,
  QuestionMatchPair,
  QuestionOption,
  QuestionSequenceItem,
  QuestionState,
  QuestionType,
  QuestionVersion,
} from '../../../../features/adaptive-learning/models/question.model';
import { Rubric } from '../../../../features/adaptive-learning/models/rubric.model';
import { selectQuestions } from '../../../../features/adaptive-learning/domain/question-selector';
import { SeedContext } from './seed-context';

/** Soru yazarı/favori dağıtımı için gereken asgari kullanıcı bilgisi. */
export interface UserSeedRef {
  readonly id: string;
  readonly fullName: string;
  readonly roles: readonly string[];
}

export interface AssessmentSeed {
  readonly rubrics: Rubric[];
  readonly questions: Question[];
  readonly questionVersions: QuestionVersion[];
  readonly blueprints: ExamBlueprint[];
  readonly exams: Exam[];
}

/** 20 ders × 15 soru = 300 soruluk banka. */
const QUESTIONS_PER_COURSE = 15;
/** 20 ders × 3 sınav = 60 sınav. */
const EXAMS_PER_COURSE = 3;

const STEM_TEMPLATES: Readonly<Record<QuestionType, string>> = {
  single_choice: '{title} konusunda aşağıdakilerden hangisi doğrudur?',
  multiple_choice: '{title} ile ilgili aşağıdaki ifadelerden hangileri doğrudur?',
  true_false: '"{description}" ifadesi doğru mudur?',
  numeric: '{title} uygulamasında verilen değerlere göre sonucu hesaplayınız.',
  short_answer: '{title} kavramını bir cümleyle tanımlayınız.',
  open_ended: '{title} konusunu bir uygulama örneği üzerinden açıklayınız ve gerekçelendiriniz.',
  matching: '{title} ile ilgili kavramları doğru karşılıklarıyla eşleştiriniz.',
  ordering: '{title} sürecindeki adımları doğru sıraya diziniz.',
};

/** Soru başlığı — listede görünen kısa ad. */
const TITLE_TEMPLATES: Readonly<Record<QuestionType, string>> = {
  single_choice: '{title} — kavram kontrolü',
  multiple_choice: '{title} — çoklu doğru',
  true_false: '{title} — doğru/yanlış',
  numeric: '{title} — hesaplama',
  short_answer: '{title} — kısa tanım',
  open_ended: '{title} — uygulama ve gerekçe',
  matching: '{title} — kavram eşleştirme',
  ordering: '{title} — adım sıralama',
};

const MATCH_TERMS: readonly (readonly [string, string])[] = [
  ['Tanım', 'Kavramın sınırlarını belirler'],
  ['Örnek', 'Kavramın somut bir örneğidir'],
  ['Karşı örnek', 'Kavramın dışında kalan durum'],
  ['Ölçüt', 'Doğruluğun değerlendirildiği kural'],
  ['Uygulama', 'Kavramın kullanıldığı bağlam'],
];

const SEQUENCE_STEPS: readonly string[] = [
  'Problemi tanımla',
  'Verileri topla',
  'Modeli kur',
  'Çözümü uygula',
  'Sonucu doğrula',
];

const OPTION_TEMPLATES: readonly string[] = [
  'Tanımın tüm koşulları sağlanmalıdır.',
  'Yalnızca tek yönlü koşul yeterlidir.',
  'Koşul yalnızca özel durumlarda geçerlidir.',
  'Koşul ile sonuç arasında ilişki yoktur.',
  'Sonuç, başlangıç değerinden bağımsızdır.',
];

const RATIONALES: readonly string[] = [
  'Tanımdaki koşullardan biri göz ardı edilmiştir.',
  'Genel kural özel duruma yanlış genellenmiştir.',
  'İşlem sırası hatalı uygulanmıştır.',
  'Kavram, yakın anlamlı başka bir kavramla karıştırılmıştır.',
];

const TAG_POOL: readonly string[] = [
  'temel',
  'uygulama',
  'kavramsal',
  'işlem',
  'yorum',
  'grafik',
  'modelleme',
  'sınav-klasiği',
];

const QUESTION_TYPE_WEIGHTS: readonly (readonly [QuestionType, number])[] = [
  ['single_choice', 32],
  ['multiple_choice', 16],
  ['true_false', 10],
  ['numeric', 10],
  ['short_answer', 8],
  ['open_ended', 10],
  ['matching', 7],
  ['ordering', 7],
];

const DIFFICULTY_WEIGHTS: readonly (readonly [Difficulty, number])[] = [
  ['easy', 30],
  ['medium', 45],
  ['hard', 25],
];

/** Tür başına tahmini çözüm süresi aralığı (saniye). */
const SOLVE_TIME_BY_TYPE: Readonly<Record<QuestionType, readonly [number, number]>> = {
  single_choice: [45, 120],
  multiple_choice: [60, 180],
  true_false: [20, 60],
  numeric: [90, 300],
  short_answer: [90, 240],
  open_ended: [300, 900],
  matching: [120, 300],
  ordering: [90, 240],
};

/**
 * Soru bankası, rubrikler, blueprint'ler ve sınavlar.
 *
 * · Yayınlanmış her soru için bir `QuestionVersion` snapshot'ı üretilir (BR-03).
 * · Sınavlar soruya değil, snapshot'a bağlanır — soru sonradan değişse bile
 *   geçmiş sınavlar etkilenmez.
 * · Son iki ders için blueprint'i karşılamayan taslak sınavlar bırakılır,
 *   böylece "eksik kapsama" uyarısı demo edilebilir (BR-04).
 */
export function seedAssessment(
  ctx: SeedContext,
  courses: readonly Course[],
  outcomes: readonly LearningOutcome[],
  users: readonly UserSeedRef[],
): AssessmentSeed {
  const rubrics = courses.map((course) => buildRubric(ctx, course));
  const questions: Question[] = [];
  const questionVersions: QuestionVersion[] = [];

  const nameById = new Map(users.map((user) => [user.id, user.fullName] as const));
  const specialistIds = users
    .filter((user) => user.roles.includes('ASSESSMENT_SPECIALIST'))
    .map((user) => user.id);

  for (const course of courses) {
    const courseOutcomes = outcomes.filter((outcome) => outcome.courseId === course.id);
    const rubric = rubrics.find((item) => item.courseId === course.id)!;

    // Sorular kazanımlara sırayla dağıtılır → her kazanımın en az 2 sorusu olur.
    for (let index = 0; index < QUESTIONS_PER_COURSE; index++) {
      const outcome = courseOutcomes[index % courseOutcomes.length]!;
      const question = buildQuestion(
        ctx,
        course,
        outcome,
        rubric.id,
        index,
        specialistIds.length > 0 ? specialistIds : [course.instructorId],
      );
      questions.push(question);

      if (question.state === 'PUBLISHED') {
        const latest = question.publishedVersion ?? 1;
        const authorName = nameById.get(question.updatedBy) ?? 'Bilinmiyor';

        // En yeniden en eskiye tüm versiyonlar üretilir → karşılaştırma yapılabilir.
        for (let versionNumber = latest; versionNumber >= 1; versionNumber--) {
          questionVersions.push(buildVersion(ctx, question, versionNumber, authorName));
        }
      }
    }
  }

  const blueprints = courses.flatMap((course) =>
    buildBlueprints(
      ctx,
      course,
      outcomes.filter((outcome) => outcome.courseId === course.id),
      questions.filter(
        (question) => question.courseId === course.id && question.state === 'PUBLISHED',
      ),
    ),
  );

  const exams = buildExams(ctx, courses, blueprints, questions, questionVersions);

  return { rubrics, questions, questionVersions, blueprints, exams };
}

/* ── Rubrik ──────────────────────────────────────────────────────────────── */

function buildRubric(ctx: SeedContext, course: Course): Rubric {
  const criteria = [
    {
      title: 'Kavramsal doğruluk',
      description: 'Kullanılan kavramlar doğru ve yerinde mi?',
      weight: 2,
    },
    {
      title: 'Çözüm yaklaşımı',
      description: 'Adımlar mantıklı bir sırayla ilerliyor mu?',
      weight: 2,
    },
    { title: 'Gerekçelendirme', description: 'Sonuç kanıtlarla desteklenmiş mi?', weight: 1 },
    { title: 'Anlatım netliği', description: 'İfade açık ve anlaşılır mı?', weight: 1 },
  ].map((criterion) => ({
    id: ctx.id('crt'),
    ...criterion,
    levels: [
      { id: ctx.id('lvl'), label: 'Yetersiz', description: 'Ölçüt karşılanmamış.', points: 0 },
      { id: ctx.id('lvl'), label: 'Kısmen', description: 'Ölçüt kısmen karşılanmış.', points: 1 },
      { id: ctx.id('lvl'), label: 'Yeterli', description: 'Ölçüt karşılanmış.', points: 2 },
      { id: ctx.id('lvl'), label: 'Örnek', description: 'Ölçüt beklentinin üzerinde.', points: 3 },
    ],
  }));

  return {
    id: ctx.id('rbr'),
    name: `${course.code} Açık Uçlu Değerlendirme Rubriği`,
    description: 'Açık uçlu sorularda kriter bazlı puanlama için kullanılır.',
    courseId: course.id,
    criteria,
    maxPoints: criteria.reduce((total, criterion) => total + 3 * criterion.weight, 0),
    createdAt: ctx.date(-180),
    updatedAt: ctx.pastDate(10, 60),
    version: 1,
    createdBy: course.instructorId,
    updatedBy: course.instructorId,
  };
}

/* ── Soru ────────────────────────────────────────────────────────────────── */

function buildQuestion(
  ctx: SeedContext,
  course: Course,
  outcome: LearningOutcome,
  rubricId: string,
  indexInCourse: number,
  specialistIds: readonly string[],
): Question {
  const type = ctx.rng.weighted(QUESTION_TYPE_WEIGHTS);
  const difficulty = ctx.rng.weighted(DIFFICULTY_WEIGHTS);
  const meta = QUESTION_TYPE_META[type];

  const state = ctx.rng.weighted<QuestionState>([
    ['PUBLISHED', 62],
    ['DRAFT', 18],
    ['REVIEW', 12],
    ['ARCHIVED', 8],
  ]);

  const versionNumber = state === 'PUBLISHED' ? ctx.rng.int(1, 3) : 1;
  /*
   * Soru yazım tarihleri SON GÜNLERE de yayılır.
   *
   * Alt sınır 60 gün olunca yönetim panosundaki "soru bankası büyümesi"
   * grafiği son 30 günde düz çıkıyordu; soru bankası sürekli beslenen bir
   * havuzdur, aralıklarla değil.
   */
  const createdDaysAgo = ctx.rng.int(3, 170);
  const [minTime, maxTime] = SOLVE_TIME_BY_TYPE[type];

  return {
    id: ctx.id('qst'),
    code: `${outcome.code}-S${indexInCourse + 1}`,
    title: TITLE_TEMPLATES[type].replace('{title}', outcome.title),
    stem: `<p>${STEM_TEMPLATES[type]
      .replace('{title}', outcome.title)
      .replace('{description}', outcome.description)}</p>`,
    type,
    courseId: course.id,
    outcomeIds: [outcome.id],
    difficulty,
    level: outcome.level,
    points: meta.defaultPoints,
    estimatedSolveTimeSeconds: ctx.rng.int(minTime, maxTime),
    options: buildOptions(ctx, type),
    matchPairs: buildMatchPairs(ctx, type),
    sequenceItems: buildSequenceItems(ctx, type),
    expectedAnswer:
      type === 'numeric'
        ? String(ctx.rng.int(2, 96))
        : type === 'short_answer'
          ? outcome.title
          : null,
    numericTolerance: type === 'numeric' ? ctx.rng.pick([0, 0.01, 0.1, 0.5]) : null,
    explanation: `${outcome.title} kazanımının tanımından hareketle çözülür. ${outcome.description}`,
    attachments: [],
    tags: ctx.rng.sample(TAG_POOL, ctx.rng.int(1, 3)),
    state,
    rubricId: meta.manuallyGraded ? rubricId : null,
    versionNumber,
    pendingChangeNote: null,
    publishedVersion: state === 'PUBLISHED' ? versionNumber : null,
    usageCount: state === 'PUBLISHED' ? ctx.rng.int(0, 9) : 0,
    allowPartialCredit: meta.multipleCorrect,
    // Ölçme uzmanlarının bir kısmı soruları favorilemiştir — panel kartı dolu gelsin.
    favoritedBy: ctx.rng.bool(0.18) ? [ctx.rng.pick(specialistIds)] : [],
    publishedAt: state === 'PUBLISHED' ? ctx.pastDate(5, 90) : null,
    archivedAt: state === 'ARCHIVED' ? ctx.pastDate(5, 60) : null,
    deletedAt: null,
    createdAt: ctx.date(-createdDaysAgo),
    updatedAt: ctx.pastDate(1, Math.max(2, createdDaysAgo - 1)),
    version: ctx.rng.int(1, 5),
    createdBy: course.instructorId,
    updatedBy: course.instructorId,
  };
}

function buildOptions(ctx: SeedContext, type: QuestionType): QuestionOption[] {
  const meta = QUESTION_TYPE_META[type];
  if (meta.answerShape !== 'options') return [];

  if (type === 'true_false') {
    const correctIsTrue = ctx.rng.bool();
    return [
      { id: ctx.id('opt'), text: 'Doğru', correct: correctIsTrue, rationale: '' },
      {
        id: ctx.id('opt'),
        text: 'Yanlış',
        correct: !correctIsTrue,
        rationale: correctIsTrue ? ctx.rng.pick(RATIONALES) : '',
      },
    ];
  }

  const correctCount = meta.multipleCorrect ? 2 : 1;
  const texts = ctx.rng.shuffle(OPTION_TEMPLATES).slice(0, 4);

  return texts.map((text, index) => ({
    id: ctx.id('opt'),
    text,
    correct: index < correctCount,
    rationale: index < correctCount ? '' : ctx.rng.pick(RATIONALES),
  }));
}

function buildMatchPairs(ctx: SeedContext, type: QuestionType): QuestionMatchPair[] {
  if (QUESTION_TYPE_META[type].answerShape !== 'pairs') return [];

  return ctx.rng.sample(MATCH_TERMS, 4).map(([left, right]) => ({
    id: ctx.id('mtc'),
    left,
    right,
  }));
}

function buildSequenceItems(ctx: SeedContext, type: QuestionType): QuestionSequenceItem[] {
  if (QUESTION_TYPE_META[type].answerShape !== 'sequence') return [];

  // Sıra numaraları daima 1..n; karıştırma öğrenciye gösterim anında yapılır.
  return SEQUENCE_STEPS.slice(0, 4).map((text, index) => ({
    id: ctx.id('seq'),
    text,
    order: index + 1,
  }));
}

/**
 * Versiyon snapshot'ı.
 *
 * Eski versiyonlar bilinçli olarak FARKLI değerler taşır (zorluk, Bloom seviyesi,
 * puan ve süre bir kademe düşük) — böylece versiyon karşılaştırma ekranı demo
 * verisinde de gerçek bir fark gösterir.
 */
function buildVersion(
  ctx: SeedContext,
  question: Question,
  versionNumber: number,
  authorName: string,
): QuestionVersion {
  const { usageCount: _usageCount, favoritedBy: _favoritedBy, ...current } = question;
  const isLatest = versionNumber >= (question.publishedVersion ?? 1);

  const snapshot = isLatest
    ? { ...current, versionNumber }
    : {
        ...current,
        versionNumber,
        title: `${current.title} (önceki sürüm)`,
        difficulty: downgradeDifficulty(current.difficulty),
        level: downgradeLevel(current.level),
        points: Math.max(1, current.points - 1),
        estimatedSolveTimeSeconds: Math.max(
          10,
          Math.round(current.estimatedSolveTimeSeconds * 0.8),
        ),
        stem: current.stem.replace('</p>', ' (ilk sürüm)</p>'),
      };

  return {
    id: ctx.id('qvr'),
    questionId: question.id,
    versionNumber: Math.max(1, versionNumber),
    snapshot,
    changeNote:
      versionNumber <= 1
        ? 'İlk yayın.'
        : ctx.rng.pick([
            'Soru kökü sadeleştirildi.',
            'Çeldirici metni netleştirildi.',
            'Puan değeri güncellendi.',
            'Kazanım eşleştirmesi düzeltildi.',
          ]),
    publishedBy: question.updatedBy,
    publishedByName: authorName,
    publishedAt: ctx.pastDate(5 + (isLatest ? 0 : 30), 90),
  };
}

const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard'];

function downgradeDifficulty(difficulty: Difficulty): Difficulty {
  const index = DIFFICULTY_ORDER.indexOf(difficulty);
  return DIFFICULTY_ORDER[Math.max(0, index - 1)]!;
}

function downgradeLevel(level: CognitiveLevel): CognitiveLevel {
  const index = COGNITIVE_LEVELS.indexOf(level);
  return COGNITIVE_LEVELS[Math.max(0, index - 1)]!;
}

/* ── Blueprint ───────────────────────────────────────────────────────────── */

/**
 * Ders başına blueprint'ler.
 *
 * Her ders için bir "ders geneli" plan üretilir; dersin ilk cohort'u için ayrıca
 * cohort'a özel bir plan yazılır ki Cohort Blueprint ekranı boş kalmasın.
 */
function buildBlueprints(
  ctx: SeedContext,
  course: Course,
  outcomes: readonly LearningOutcome[],
  pool: readonly Question[],
): ExamBlueprint[] {
  const published = outcomes.filter((outcome) => outcome.state === 'PUBLISHED');
  const selected = published.slice(0, Math.min(5, published.length));
  if (selected.length === 0) return [];

  const general = blueprintOf(
    ctx,
    course,
    selected,
    pool,
    null,
    `${course.code} Dönem Sonu Blueprint`,
  );
  const cohortId = course.cohortIds[0];

  if (!cohortId) return [general];

  return [
    general,
    blueprintOf(
      ctx,
      course,
      selected.slice(0, Math.max(2, selected.length - 1)),
      pool,
      cohortId,
      `${course.code} Ara Sınav Blueprint (grup planı)`,
    ),
  ];
}

function blueprintOf(
  ctx: SeedContext,
  course: Course,
  outcomes: readonly LearningOutcome[],
  pool: readonly Question[],
  cohortId: string | null,
  name: string,
): ExamBlueprint {
  /*
   * Kazanım başına 1 kolay + 1 orta + 1 zor hedeflenir, ancak her hücre bankada
   * gerçekten bulunan soru sayısıyla sınırlanır. Aksi hâlde tohumdan gelen plan
   * kendi soru bankasıyla karşılanamaz ve YAYINDA sınavlar doğrulamadan geçemez.
   *
   * Bir soru birden çok kazanıma bağlı olabildiği için seçici onu tek hücreye
   * kilitler; bu yüzden sayım da soruları hücrelere tek tek paylaştırır.
   */
  const claimed = new Set<string>();

  const available = (outcomeId: string, difficulty: Difficulty): number => {
    const matches = pool.filter(
      (question) =>
        question.difficulty === difficulty &&
        question.outcomeIds.includes(outcomeId) &&
        !claimed.has(question.id),
    );

    const taken = matches.slice(0, 1);
    for (const question of taken) claimed.add(question.id);
    return taken.length;
  };

  const rows = outcomes.map((outcome) => ({
    outcomeId: outcome.id,
    easy: available(outcome.id, 'easy'),
    medium: available(outcome.id, 'medium'),
    hard: available(outcome.id, 'hard'),
  }));

  const totalQuestions = rows.reduce((sum, row) => sum + row.easy + row.medium + row.hard, 0);

  return {
    id: ctx.id('blp'),
    name,
    description:
      'Kazanım kapsaması ve zorluk dengesi bu plana göre denetlenir. Sorular plandaki hücrelere göre otomatik seçilir.',
    courseId: course.id,
    cohortId,
    rows,
    // Soru başına 4 puan varsayımıyla yuvarlak bir hedef.
    targetTotalPoints: totalQuestions * 4,
    targetDurationMinutes: Math.max(30, totalQuestions * 4),
    state: 'PUBLISHED',
    publishedAt: ctx.date(-110),
    archivedAt: null,
    createdAt: ctx.date(-120),
    updatedAt: ctx.pastDate(3, 45),
    version: ctx.rng.int(1, 3),
    createdBy: course.instructorId,
    updatedBy: course.instructorId,
  };
}

/* ── Sınav ───────────────────────────────────────────────────────────────── */

/**
 * Sınav planı.
 *
 * `state` YAZIM durumudur (taslak/incelemede/yayında). "Planlandı / devam ediyor /
 * kapandı" gibi çalışma durumları saklanmaz; tarihlerden türetilir
 * (`domain/exam-runtime.ts`). Bu yüzden plan yalnızca tarih penceresini verir.
 */
interface ExamPlan {
  readonly state: ExamState;
  readonly titleSuffix: string;
  readonly opensInDays: number;
  /** Sınav penceresinin uzunluğu (saat). */
  readonly windowHours: number;
  readonly maxAttempts: number;
  /**
   * Penceresi GERÇEK ZAMANA göre kurulan demo sınavı.
   *
   * Diğer tüm tarihler `REFERENCE_DATE`'e göre üretilir ve bu, demo tekrarlanabilir
   * olsun diye böyledir. Ancak öğrencinin sınava girebilmesi için "şu anda açık"
   * bir sınav gerekir; sabit tarih birkaç gün sonra geçmişte kalırdı. Bu yüzden
   * yalnızca bu plan, tohumun üretildiği ana göre geniş bir pencere alır.
   */
  readonly liveWindow?: boolean;
}

/** Demo sınavının penceresi: bir saat önce açıldı, 30 gün açık kalacak. */
const LIVE_WINDOW_BEFORE_MS = 60 * 60_000;
const LIVE_WINDOW_AFTER_MS = 30 * 24 * 60 * 60_000;

function buildExams(
  ctx: SeedContext,
  courses: readonly Course[],
  blueprints: readonly ExamBlueprint[],
  questions: readonly Question[],
  versions: readonly QuestionVersion[],
): Exam[] {
  const exams: Exam[] = [];

  courses.forEach((course, courseIndex) => {
    // Ders geneli plan (cohort'a özel olan sınavda kullanılmaz).
    const blueprint = blueprints.find(
      (item) => item.courseId === course.id && item.cohortId === null,
    );
    const pool = questions.filter(
      (question) => question.courseId === course.id && question.state === 'PUBLISHED',
    );

    // Yayınlanmamış dersler için sınavlar da yayına alınmamış olmalıdır.
    const isDraftCourse = course.state !== 'PUBLISHED';

    const livePlan: ExamPlan = {
      state: 'PUBLISHED',
      titleSuffix: 'Alıştırma Sınavı (Açık)',
      opensInDays: 0,
      windowHours: 0,
      maxAttempts: 2,
      liveWindow: true,
    };

    const plans: readonly ExamPlan[] = isDraftCourse
      ? [
          {
            state: 'DRAFT',
            titleSuffix: 'Deneme Sınavı (Taslak)',
            opensInDays: 30,
            windowHours: 4,
            maxAttempts: 1,
          },
          {
            state: 'REVIEW',
            titleSuffix: 'Ara Sınav (İncelemede)',
            opensInDays: 38,
            windowHours: 4,
            maxAttempts: 1,
          },
          {
            // Yayında ve tarihi gelecekte → çalışma durumu "planlandı".
            state: 'PUBLISHED',
            titleSuffix: 'Dönem Sonu Sınavı',
            opensInDays: ctx.rng.int(5, 25),
            windowHours: 4,
            maxAttempts: 1,
          },
        ]
      : [
          {
            // Yayında ve penceresi kapanmış → çalışma durumu "kapandı".
            state: 'PUBLISHED',
            titleSuffix: '1. Ara Sınav',
            opensInDays: -ctx.rng.int(60, 95),
            windowHours: 4,
            maxAttempts: 1,
          },
          {
            state: 'PUBLISHED',
            titleSuffix: '2. Ara Sınav',
            opensInDays: -ctx.rng.int(20, 55),
            windowHours: 4,
            maxAttempts: 2,
          },
          {
            state: 'PUBLISHED',
            titleSuffix: 'Dönem Sonu Sınavı',
            opensInDays: ctx.rng.int(2, 26),
            windowHours: 4,
            maxAttempts: 1,
          },
        ];

    /*
     * Soru kimliği → yayınlanmış versiyon; seçici bunu zorunlu tutar.
     * Ders başına bir kez kurulur, üç sınav planı için yeniden kullanılır.
     */
    const versionIdByQuestion = new Map<string, { id: string; versionNumber: number }>();
    for (const question of pool) {
      const version =
        versions.find(
          (item) =>
            item.questionId === question.id && item.versionNumber === question.publishedVersion,
        ) ?? versions.find((item) => item.questionId === question.id);

      if (version) {
        versionIdByQuestion.set(question.id, {
          id: version.id,
          versionNumber: version.versionNumber,
        });
      }
    }

    /* Yayınlanmış her derse ayrıca "şu anda açık" bir alıştırma sınavı eklenir. */
    const allPlans = isDraftCourse
      ? plans.slice(0, EXAMS_PER_COURSE)
      : [...plans.slice(0, EXAMS_PER_COURSE), livePlan];

    for (const plan of allPlans) {
      /*
       * Sınav soruları rastgele değil, uygulamanın kendi seçim motoruyla
       * blueprint'e göre seçilir. Aksi hâlde tohumdan gelen YAYINDA sınavlar
       * kendi planlarını ihlal eder ve kısıt paneli her sınavda hata gösterir.
       */
      const selection = blueprint
        ? selectQuestions({
            rows: blueprint.rows,
            questions: pool,
            existing: [],
            versionIdByQuestion,
          })
        : null;

      const selected = selection?.questions ?? [];

      /*
       * Puanlar, blueprint hedefine tam oturacak biçimde dağıtılır; artan puan
       * ilk sorulara birer birer eklenir. Böylece "toplam puan" kuralı sağlanır.
       */
      const targetPoints = blueprint?.targetTotalPoints ?? 0;
      const base = selected.length > 0 ? Math.floor(targetPoints / selected.length) : 0;
      const remainder = selected.length > 0 ? targetPoints - base * selected.length : 0;

      const examQuestions: ExamQuestionRef[] = selected.map((ref, index) => ({
        ...ref,
        order: index + 1,
        points: base + (index < remainder ? 1 : 0),
      }));

      const totalPoints = examQuestions.reduce((sum, ref) => sum + ref.points, 0);
      const opensAt = plan.liveWindow
        ? new Date(Date.now() - LIVE_WINDOW_BEFORE_MS).toISOString()
        : ctx.date(plan.opensInDays, 10);
      const durationMinutes = blueprint?.targetDurationMinutes ?? 60;

      exams.push({
        id: ctx.id('exm'),
        title: `${course.code} ${plan.titleSuffix}`,
        description: `${course.name} dersi için ${plan.titleSuffix.toLocaleLowerCase('tr-TR')}.`,
        instructions:
          'Sınav süresince sekme değiştirmeyiniz. Tüm soruları yanıtladıktan sonra "Gönder" butonuna basınız.',
        courseId: course.id,
        blueprintId: blueprint?.id ?? null,
        cohortIds: course.cohortIds,
        durationMinutes,
        opensAt,
        closesAt: plan.liveWindow
          ? new Date(Date.parse(opensAt) + LIVE_WINDOW_BEFORE_MS + LIVE_WINDOW_AFTER_MS).toISOString()
          : ctx.minutesFrom(opensAt, plan.windowHours * 60),
        questions: examQuestions,
        rules: {
          shuffleQuestions: true,
          shuffleOptions: ctx.rng.bool(0.6),
          allowBackNavigation: true,
          showResultImmediately: false,
          passingScore: Math.round(totalPoints * 0.5),
          maxAttempts: plan.maxAttempts,
          autoSubmit: true,
        },
        totalPoints,
        state: plan.state,
        publishedAt: plan.state === 'PUBLISHED' ? ctx.date(plan.opensInDays - 10) : null,
        archivedAt: null,
        attemptCount: 0,
        createdAt: ctx.date(plan.opensInDays - 30),
        updatedAt: ctx.pastDate(1, 20),
        version: ctx.rng.int(1, 4),
        createdBy: course.instructorId,
        updatedBy: course.instructorId,
      });
    }

    // Sıralamayı bozmadan ders sayacı ilerlesin diye kullanılan indeks.
    void courseIndex;
  });

  return exams;
}

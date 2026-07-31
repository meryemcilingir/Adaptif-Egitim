import { Role } from '../../../auth/permission.model';
import { Cohort, Term } from '../../../../features/adaptive-learning/models/common.model';
import { Program } from '../../../../features/adaptive-learning/models/program.model';
import { MockUser } from '../db/db-schema';
import { PROGRAM_CATALOG } from './course-catalog';
import { FIRST_NAMES, LAST_NAMES, SeedContext, slugify } from './seed-context';

export interface OrganizationSeed {
  readonly programs: Program[];
  readonly terms: Term[];
  readonly cohorts: Cohort[];
  readonly users: MockUser[];
  readonly studentIds: readonly string[];
  readonly instructorIds: readonly string[];
}

const DEMO_PASSWORD = 'demo1234';

const INSTRUCTOR_COUNT = 20;
/** 11 normal grup (9 kişi) + 1 küçük grup (3 kişi) = 102 öğrenci. */
const REGULAR_COHORT_COUNT = 11;
const REGULAR_COHORT_SIZE = 9;
const SMALL_COHORT_SIZE = 3;

/** AI_CONTEXT.md §9'daki demo hesaplarla birebir aynı. */
const DEMO_ACCOUNTS: readonly {
  readonly email: string;
  readonly fullName: string;
  readonly title: string;
  readonly roles: readonly Role[];
}[] = [
  {
    email: 'student@adaptif.dev',
    fullName: 'Elif Yılmaz',
    title: 'Öğrenci · 3. Sınıf',
    roles: ['STUDENT'],
  },
  {
    email: 'instructor@adaptif.dev',
    fullName: 'Dr. Kaan Demir',
    title: 'Öğretim Görevlisi',
    roles: ['INSTRUCTOR'],
  },
  {
    email: 'specialist@adaptif.dev',
    fullName: 'Selin Aydın',
    title: 'Ölçme ve Değerlendirme Uzmanı',
    roles: ['ASSESSMENT_SPECIALIST'],
  },
  {
    email: 'manager@adaptif.dev',
    fullName: 'Emre Şahin',
    title: 'Program Koordinatörü',
    roles: ['PROGRAM_MANAGER'],
  },
  {
    email: 'observer@adaptif.dev',
    fullName: 'Ayşe Kaya',
    title: 'Kalite Gözlemcisi',
    roles: ['OBSERVER'],
  },
  {
    email: 'admin@adaptif.dev',
    fullName: 'Mert Çelik',
    title: 'Platform Yöneticisi',
    roles: ['PLATFORM_ADMIN'],
  },
];

const COHORT_SUFFIXES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];

/**
 * Kurum yapısı: programlar, dönemler, cohort'lar ve kullanıcılar.
 *
 * Son cohort bilinçli olarak KÜÇÜK tutulur (3 öğrenci) — gizlilik eşiği (BR-17)
 * demo sırasında gerçekten tetiklensin diye.
 */
export function seedOrganization(ctx: SeedContext): OrganizationSeed {
  /*
   * Programların çoğu yayında; son ikisi bilinçli olarak inceleme/taslak bırakılır
   * ki yayın iş akışı (BR-21) ve durum filtreleri demo edilebilsin.
   */
  const programs: Program[] = PROGRAM_CATALOG.map((blueprint, index) => {
    const state =
      index === PROGRAM_CATALOG.length - 1
        ? 'DRAFT'
        : index === PROGRAM_CATALOG.length - 2
          ? 'REVIEW'
          : 'PUBLISHED';

    return {
      id: `prg_${String(index + 1).padStart(3, '0')}`,
      code: blueprint.code,
      name: blueprint.name,
      description: `${blueprint.name} kapsamındaki dersler, kazanımlar ve ölçme süreçlerini kapsayan akademik program.`,
      state,
      coordinatorId: '',
      coordinatorName: '',
      courseCount: 0,
      outcomeCount: 0,
      studentCount: 0,
      publishedAt: state === 'PUBLISHED' ? ctx.date(-220 + index) : null,
      archivedAt: null,
      createdAt: ctx.date(-320 + index),
      updatedAt: ctx.pastDate(1, 40),
      version: 1,
      createdBy: '',
      updatedBy: '',
    } satisfies Program;
  });

  const terms: Term[] = [
    {
      id: 'trm_001',
      name: '2025-2026 Güz',
      startDate: ctx.date(-280),
      endDate: ctx.date(-160),
      active: false,
    },
    {
      id: 'trm_002',
      name: '2025-2026 Bahar',
      startDate: ctx.date(-150),
      endDate: ctx.date(30),
      active: true,
    },
  ];

  const users: MockUser[] = [];
  const studentIds: string[] = [];
  const instructorIds: string[] = [];

  const createUser = (input: {
    fullName: string;
    email: string;
    roles: readonly Role[];
    title: string;
    programId: string | null;
  }): MockUser => {
    const id = ctx.id('usr');
    const user: MockUser = {
      id,
      fullName: input.fullName,
      email: input.email,
      password: DEMO_PASSWORD,
      avatarUrl: null,
      roles: input.roles,
      primaryRole: input.roles[0]!,
      title: input.title,
      programId: input.programId,
      courseIds: [],
      cohortIds: [],
      state: 'ACTIVE',
      lastLoginAt: ctx.pastDate(0, 6),
      createdAt: ctx.date(-300),
      updatedAt: ctx.pastDate(0, 30),
      version: 1,
    };
    users.push(user);
    return user;
  };

  // 1) Demo hesapları — her rol için bir tane.
  for (const account of DEMO_ACCOUNTS) {
    const user = createUser({
      fullName: account.fullName,
      email: account.email,
      roles: account.roles,
      title: account.title,
      programId: programs[0]!.id,
    });

    if (account.roles.includes('STUDENT')) studentIds.push(user.id);
    if (account.roles.includes('INSTRUCTOR')) instructorIds.push(user.id);
  }

  // 2) Ek eğitmenler — 20 eğitmene tamamlanır, programlara dağıtılır.
  for (let i = instructorIds.length; i < INSTRUCTOR_COUNT; i++) {
    const fullName = `${FIRST_NAMES[(i * 7) % FIRST_NAMES.length]} ${LAST_NAMES[(i * 3) % LAST_NAMES.length]}`;
    const user = createUser({
      fullName: `Dr. ${fullName}`,
      email: `${slugify(fullName)}.${i}@adaptif.dev`,
      roles: ['INSTRUCTOR'],
      title: ctx.rng.pick(['Öğretim Görevlisi', 'Doç. Dr.', 'Prof. Dr.', 'Araştırma Görevlisi']),
      programId: programs[i % programs.length]!.id,
    });
    instructorIds.push(user.id);
  }

  // 3) Ölçme uzmanı ve gözlemci kadrosu — analitik ekranlarının kapsam testi için.
  for (let i = 0; i < 3; i++) {
    const fullName = `${FIRST_NAMES[(i * 11 + 5) % FIRST_NAMES.length]} ${LAST_NAMES[(i * 5 + 2) % LAST_NAMES.length]}`;
    createUser({
      fullName,
      email: `${slugify(fullName)}.olcme${i}@adaptif.dev`,
      roles: ['ASSESSMENT_SPECIALIST'],
      title: 'Ölçme ve Değerlendirme Uzmanı',
      programId: programs[i % programs.length]!.id,
    });
  }

  for (let i = 0; i < 2; i++) {
    const fullName = `${FIRST_NAMES[(i * 13 + 9) % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7 + 4) % LAST_NAMES.length]}`;
    createUser({
      fullName,
      email: `${slugify(fullName)}.gozlem${i}@adaptif.dev`,
      roles: ['OBSERVER'],
      title: 'Kalite Gözlemcisi',
      programId: programs[i % programs.length]!.id,
    });
  }

  // 4) Öğrenciler.
  const studentTarget = REGULAR_COHORT_COUNT * REGULAR_COHORT_SIZE + SMALL_COHORT_SIZE;
  for (let i = studentIds.length; i < studentTarget; i++) {
    const fullName = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 3 + 1) % LAST_NAMES.length]}`;
    const user = createUser({
      fullName,
      email: `${slugify(fullName)}${i}@ogrenci.adaptif.dev`,
      roles: ['STUDENT'],
      title: `Öğrenci · ${(i % 4) + 1}. Sınıf`,
      programId: programs[i % programs.length]!.id,
    });
    studentIds.push(user.id);
  }

  // 5) Cohort dağılımı — son grup gizlilik eşiğinin altında kalır.
  const cohorts: Cohort[] = [];
  for (let index = 0; index < REGULAR_COHORT_COUNT; index++) {
    cohorts.push({
      id: `chr_${String(index + 1).padStart(3, '0')}`,
      name: `2026-${COHORT_SUFFIXES[index]} Grubu`,
      programId: programs[index % programs.length]!.id,
      termId: terms[1]!.id,
      studentIds: studentIds.slice(index * REGULAR_COHORT_SIZE, (index + 1) * REGULAR_COHORT_SIZE),
    });
  }

  cohorts.push({
    id: `chr_${String(REGULAR_COHORT_COUNT + 1).padStart(3, '0')}`,
    name: 'Yaz Okulu (Küçük Grup)',
    programId: programs[0]!.id,
    termId: terms[1]!.id,
    studentIds: studentIds.slice(-SMALL_COHORT_SIZE),
  });

  // 6) Cohort üyeliğini kullanıcı kaydına geri yaz (veri kapsamı kontrolü için).
  const withCohorts = users.map((user) => {
    const memberOf = cohorts.filter((cohort) => cohort.studentIds.includes(user.id));
    if (memberOf.length > 0) {
      return { ...user, cohortIds: memberOf.map((cohort) => cohort.id) };
    }
    // Gözlemci yalnızca yetkilendirildiği cohort'ları izleyebilir.
    if (user.roles.includes('OBSERVER')) {
      return { ...user, cohortIds: cohorts.slice(0, 3).map((cohort) => cohort.id) };
    }
    return user;
  });

  // 7) Program koordinatörü: program yöneticisi rolündeki kullanıcı atanır.
  const coordinator =
    withCohorts.find((user) => user.roles.includes('PROGRAM_MANAGER')) ?? withCohorts[0]!;

  const programsWithCoordinator = programs.map((program) => ({
    ...program,
    coordinatorId: coordinator.id,
    coordinatorName: coordinator.fullName,
    createdBy: coordinator.id,
    updatedBy: coordinator.id,
  }));

  return {
    programs: programsWithCoordinator,
    terms,
    cohorts,
    users: withCohorts,
    studentIds,
    instructorIds,
  };
}

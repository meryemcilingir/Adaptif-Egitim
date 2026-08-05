import { AuditEvent } from '../../../observability/audit.model';
import { RoleDefinition } from '../../../auth/role-definition';
import {
  LoginEvent,
  NotificationCampaign,
  SystemSettings,
} from '../../../../features/administration/models/admin.model';
import { Attempt } from '../../../../features/adaptive-learning/models/attempt.model';
import { Cohort, Term } from '../../../../features/adaptive-learning/models/common.model';
import { Program } from '../../../../features/adaptive-learning/models/program.model';
import {
  ContentItem,
  ContentProgress,
} from '../../../../features/adaptive-learning/models/content-item.model';
import { Course } from '../../../../features/adaptive-learning/models/course.model';
import {
  AnswerDraft,
  ExamSession,
} from '../../../../features/adaptive-learning/models/exam-session.model';
import { ExamBlueprint } from '../../../../features/adaptive-learning/models/blueprint.model';
import { Exam } from '../../../../features/adaptive-learning/models/exam.model';
import { ItemAnalysis } from '../../../../features/adaptive-learning/models/item-analysis.model';
import { LearningOutcome } from '../../../../features/adaptive-learning/models/learning-outcome.model';
import { MasteryScore } from '../../../../features/adaptive-learning/models/mastery.model';
import { Notification } from '../../../../features/adaptive-learning/models/notification.model';
import {
  Question,
  QuestionVersion,
} from '../../../../features/adaptive-learning/models/question.model';
import { Recommendation } from '../../../../features/adaptive-learning/models/recommendation.model';
import { Rubric } from '../../../../features/adaptive-learning/models/rubric.model';
import { SavedReport } from '../../../../features/adaptive-learning/models/analytics.model';
import { User } from '../../../../features/adaptive-learning/models/user.model';

/**
 * Fake DB şeması — "sunucunun veritabanı".
 *
 * Mimari notu: `core/api/mock/**` bir sunucu taklididir, bu yüzden feature
 * modellerini TİP olarak kullanabilen tek core alt klasörüdür.
 * (ARCHITECTURE.md §2, istisna maddesi)
 */

/**
 * Kullanıcı kaydı + parola.
 *
 * Ayrı bir "hesap" koleksiyonu tutulmaz; parola alanı `User` üzerine eklenir.
 * Böylece kullanıcı listesi ile giriş bilgileri arasında senkronizasyon sorunu olmaz.
 * Parola hiçbir yanıt gövdesine konmaz (bkz. `auth.handlers.ts`).
 */
export interface MockUser extends User {
  readonly password: string;
}

export interface DbSchema {
  users: MockUser[];
  programs: Program[];
  terms: Term[];
  cohorts: Cohort[];
  courses: Course[];
  outcomes: LearningOutcome[];
  contents: ContentItem[];
  contentProgress: ContentProgress[];
  questions: Question[];
  questionVersions: QuestionVersion[];
  rubrics: Rubric[];
  blueprints: ExamBlueprint[];
  exams: Exam[];
  sessions: ExamSession[];
  answerDrafts: AnswerDraft[];
  attempts: Attempt[];
  masteryScores: MasteryScore[];
  recommendations: Recommendation[];
  itemAnalyses: ItemAnalysis[];
  savedReports: SavedReport[];
  auditEvents: AuditEvent[];
  notifications: Notification[];
  roleDefinitions: StoredRoleDefinition[];
  notificationCampaigns: NotificationCampaign[];
  loginEvents: LoginEvent[];
  /** Tek kayıtlı koleksiyon: sistem ayarları (`id: 'settings'`). */
  systemSettings: StoredSettings[];
}

/** Rol tanımı kimlik taşır; koleksiyon sözleşmesi bunu gerektirir. */
export type StoredRoleDefinition = RoleDefinition;

/** Ayarlar tek satırdır ama koleksiyon motoru kimlik bekler. */
export type StoredSettings = SystemSettings & { readonly id: string };

export type CollectionName = keyof DbSchema;

export const COLLECTION_NAMES: readonly CollectionName[] = [
  'users',
  'programs',
  'terms',
  'cohorts',
  'courses',
  'outcomes',
  'contents',
  'contentProgress',
  'questions',
  'questionVersions',
  'rubrics',
  'blueprints',
  'exams',
  'sessions',
  'answerDrafts',
  'attempts',
  'masteryScores',
  'recommendations',
  'itemAnalyses',
  'savedReports',
  'auditEvents',
  'notifications',
  'roleDefinitions',
  'notificationCampaigns',
  'loginEvents',
  'systemSettings',
];

/**
 * Şema sürümü. Seed yapısı değişince artırılır; tarayıcıdaki eski veri
 * otomatik olarak atılıp yeniden üretilir.
 */
export const DB_SCHEMA_VERSION = 18;

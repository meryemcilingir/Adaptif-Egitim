import { MockHandler } from '../mock-router';
import { ANALYTICS_HANDLERS } from './analytics.handlers';
import { ASSESSMENT_HANDLERS } from './assessment.handlers';
import { BLUEPRINT_HANDLERS } from './assessment/blueprint.handlers';
import { EXAM_HANDLERS } from './assessment/exam.handlers';
import { QUESTION_HANDLERS } from './assessment/question.handlers';
import { AUDIT_HANDLERS } from './audit.handlers';
import { AUTH_HANDLERS } from './auth.handlers';
import { CATALOG_HANDLERS } from './catalog.handlers';
import { CONTENT_HANDLERS } from './catalog/content.handlers';
import { COURSE_HANDLERS } from './catalog/course.handlers';
import { OUTCOME_HANDLERS } from './catalog/outcome.handlers';
import { PROGRAM_HANDLERS } from './catalog/program.handlers';
import { LEARNING_HANDLERS } from './learning/learning.handlers';
import { NOTIFICATION_HANDLERS } from './notification.handlers';
import { USER_HANDLERS } from './user.handlers';

/**
 * Mock endpoint kaydı (ADR-005).
 *
 * Yeni bir modül eklemek = yeni bir `*_HANDLERS` dizisi yazıp buraya eklemek.
 * Mevcut hiçbir dosya değişmez → Open/Closed.
 *
 * SIRA ÖNEMLİ: daha özgül yollar (`/api/outcomes/graph`) genel olanlardan
 * (`/api/outcomes/:id`) önce gelmelidir. `OUTCOME_HANDLERS` bu sıralamayı
 * kendi içinde garanti eder.
 */
export const MOCK_HANDLERS: readonly MockHandler[] = [
  ...AUTH_HANDLERS,
  ...ANALYTICS_HANDLERS,
  ...NOTIFICATION_HANDLERS,
  ...USER_HANDLERS,
  ...PROGRAM_HANDLERS,
  ...OUTCOME_HANDLERS,
  ...COURSE_HANDLERS,
  ...LEARNING_HANDLERS,
  ...CONTENT_HANDLERS,
  ...CATALOG_HANDLERS,
  ...QUESTION_HANDLERS,
  ...BLUEPRINT_HANDLERS,
  ...EXAM_HANDLERS,
  ...ASSESSMENT_HANDLERS,
  ...AUDIT_HANDLERS,
];

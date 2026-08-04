import { MockHandler } from '../mock-router';
import { ANALYTICS_HANDLERS } from './analytics.handlers';
import { ANALYTICS_REPORT_HANDLERS } from './analytics/analytics-reports.handlers';
import { ASSESSMENT_HANDLERS } from './assessment.handlers';
import { BLUEPRINT_HANDLERS } from './assessment/blueprint.handlers';
import { EXAM_HANDLERS } from './assessment/exam.handlers';
import { QUESTION_HANDLERS } from './assessment/question.handlers';
import { AUDIT_HANDLERS } from './audit.handlers';
import { AUTH_HANDLERS } from './auth.handlers';
import { CATALOG_HANDLERS } from './catalog.handlers';
import { GRADING_HANDLERS } from './grading/grading.handlers';
import { CONTENT_HANDLERS } from './catalog/content.handlers';
import { COURSE_HANDLERS } from './catalog/course.handlers';
import { OUTCOME_HANDLERS } from './catalog/outcome.handlers';
import { PROGRAM_HANDLERS } from './catalog/program.handlers';
import { LEARNING_HANDLERS } from './learning/learning.handlers';
import { NOTIFICATION_HANDLERS } from './notification.handlers';
import { SESSION_HANDLERS } from './session/session.handlers';
import { ADMIN_OVERVIEW_HANDLERS } from './admin/admin-overview.handlers';
import { CAMPAIGN_HANDLERS } from './admin/campaign.handlers';
import { ROLE_ADMIN_HANDLERS } from './admin/role-admin.handlers';
import { SEARCH_HANDLERS } from './admin/search.handlers';
import { SETTINGS_HANDLERS } from './admin/settings.handlers';
import { TERM_ADMIN_HANDLERS } from './admin/term-admin.handlers';
import { USER_ADMIN_HANDLERS } from './admin/user-admin.handlers';

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
  ...ANALYTICS_REPORT_HANDLERS,
  ...ANALYTICS_HANDLERS,
  ...NOTIFICATION_HANDLERS,
  ...ADMIN_OVERVIEW_HANDLERS,
  ...SEARCH_HANDLERS,
  ...ROLE_ADMIN_HANDLERS,
  ...TERM_ADMIN_HANDLERS,
  ...SETTINGS_HANDLERS,
  ...CAMPAIGN_HANDLERS,
  ...USER_ADMIN_HANDLERS,
  ...PROGRAM_HANDLERS,
  ...OUTCOME_HANDLERS,
  ...COURSE_HANDLERS,
  ...LEARNING_HANDLERS,
  ...CONTENT_HANDLERS,
  ...CATALOG_HANDLERS,
  ...QUESTION_HANDLERS,
  ...BLUEPRINT_HANDLERS,
  ...SESSION_HANDLERS,
  ...EXAM_HANDLERS,
  ...GRADING_HANDLERS,
  ...ASSESSMENT_HANDLERS,
  ...AUDIT_HANDLERS,
];

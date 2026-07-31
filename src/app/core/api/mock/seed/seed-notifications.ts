import { Attempt } from '../../../../features/adaptive-learning/models/attempt.model';
import { Course } from '../../../../features/adaptive-learning/models/course.model';
import { Exam } from '../../../../features/adaptive-learning/models/exam.model';
import { ItemAnalysis } from '../../../../features/adaptive-learning/models/item-analysis.model';
import {
  Notification,
  NotificationKind,
} from '../../../../features/adaptive-learning/models/notification.model';
import { examRuntimeStatus } from '../../../../features/adaptive-learning/domain/exam-runtime';
import { MockUser } from '../db/db-schema';
import { SeedContext } from './seed-context';

/**
 * Bildirim akışı.
 *
 * Bildirimler uydurulmaz: gerçek kayıtlardan (yaklaşan sınav, bekleyen değerlendirme,
 * açıklanan sonuç, işaretlenen madde) türetilir. Böylece bildirime tıklandığında
 * gidilen ekranda gerçekten ilgili veri bulunur.
 */
export function seedNotifications(
  ctx: SeedContext,
  users: readonly MockUser[],
  courses: readonly Course[],
  exams: readonly Exam[],
  attempts: readonly Attempt[],
  itemAnalyses: readonly ItemAnalysis[],
): Notification[] {
  const notifications: Notification[] = [];
  const courseById = new Map(courses.map((course) => [course.id, course]));

  const push = (
    userId: string,
    kind: NotificationKind,
    title: string,
    message: string,
    link: string | null,
    createdAt: string,
    read = false,
  ): void => {
    notifications.push({
      id: ctx.id('ntf'),
      userId,
      kind,
      title,
      message,
      link,
      read,
      createdAt,
    });
  };

  const upcomingExams = exams
    .filter((exam) => examRuntimeStatus(exam, Date.parse(ctx.date(0))) === 'scheduled')
    .sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt));

  // ── Öğrenciler ─────────────────────────────────────────────────────────
  for (const student of users.filter((user) => user.roles.includes('STUDENT'))) {
    const studentExams = upcomingExams.filter((exam) =>
      exam.cohortIds.some((id) => student.cohortIds.includes(id)),
    );

    for (const exam of studentExams.slice(0, 2)) {
      push(
        student.id,
        'exam_scheduled',
        exam.title,
        `${courseById.get(exam.courseId)?.name ?? 'Ders'} · ${exam.questions.length} soru, ${exam.durationMinutes} dakika.`,
        '/exams',
        ctx.pastDate(1, 8),
        ctx.rng.bool(0.4),
      );
    }

    const released = attempts.filter(
      (attempt) => attempt.studentId === student.id && attempt.state === 'RELEASED',
    );
    for (const attempt of released.slice(0, 2)) {
      push(
        student.id,
        'result_released',
        'Sınav sonucun açıklandı',
        `${attempt.examTitle} · ${attempt.totalScore}/${attempt.maxScore} puan.`,
        `/student/${student.id}/analytics`,
        attempt.releasedAt ?? attempt.submittedAt,
        ctx.rng.bool(0.6),
      );
    }

    push(
      student.id,
      'recommendation_ready',
      'Çalışma planın güncellendi',
      'Son sınav sonuçlarına göre önerilen içerik sıran yeniden hesaplandı.',
      '/learning/dashboard',
      ctx.pastDate(0, 3),
      ctx.rng.bool(0.3),
    );
  }

  // ── Eğitmenler ─────────────────────────────────────────────────────────
  for (const instructor of users.filter((user) => user.roles.includes('INSTRUCTOR'))) {
    const pending = attempts.filter(
      (attempt) =>
        attempt.state === 'PENDING_MANUAL' && instructor.courseIds.includes(attempt.courseId),
    );

    if (pending.length > 0) {
      push(
        instructor.id,
        'grading_pending',
        `${pending.length} deneme değerlendirme bekliyor`,
        'Açık uçlu cevaplar rubrik üzerinden puanlanmalı.',
        '/grading',
        ctx.pastDate(0, 4),
      );
    }

    const instructorExams = upcomingExams.filter((exam) =>
      instructor.courseIds.includes(exam.courseId),
    );
    for (const exam of instructorExams.slice(0, 2)) {
      push(
        instructor.id,
        'exam_reminder',
        `${exam.title} yaklaşıyor`,
        'Sınav ayarlarını ve soru dağılımını son kez gözden geçirin.',
        '/exams',
        ctx.pastDate(1, 6),
        ctx.rng.bool(0.5),
      );
    }
  }

  // ── Ölçme uzmanları ────────────────────────────────────────────────────
  const flagged = itemAnalyses.filter((analysis) => analysis.flags.length > 0);
  for (const specialist of users.filter((user) => user.roles.includes('ASSESSMENT_SPECIALIST'))) {
    if (flagged.length > 0) {
      push(
        specialist.id,
        'item_flagged',
        `${flagged.length} madde inceleme bekliyor`,
        'Zorluk veya ayırt edicilik eşiği dışında kalan sorular tespit edildi.',
        '/item-analysis',
        ctx.pastDate(0, 5),
      );
    }

    for (const analysis of flagged.slice(0, 2)) {
      push(
        specialist.id,
        'item_flagged',
        `${analysis.questionCode} gözden geçirilmeli`,
        `Ayırt edicilik ${analysis.discrimination}, zorluk ${analysis.difficultyIndex}.`,
        '/item-analysis',
        ctx.pastDate(1, 12),
        ctx.rng.bool(0.5),
      );
    }
  }

  // ── Program yöneticileri ve gözlemciler ────────────────────────────────
  for (const manager of users.filter((user) => user.roles.includes('PROGRAM_MANAGER'))) {
    for (const course of courses.filter((item) => item.state === 'REVIEW').slice(0, 3)) {
      push(
        manager.id,
        'outcome_published',
        `${course.code} yayın onayı bekliyor`,
        `${course.name} incelemede; kazanım kapsaması kontrol edilmeli.`,
        '/courses',
        ctx.pastDate(1, 10),
      );
    }

    push(
      manager.id,
      'system',
      'Cohort raporu hazır',
      'Dönem ortası cohort karşılaştırma raporu güncellendi.',
      '/cohort-analytics',
      ctx.pastDate(0, 2),
    );
  }

  for (const observer of users.filter((user) => user.roles.includes('OBSERVER'))) {
    push(
      observer.id,
      'system',
      'İzleme raporu güncellendi',
      'Yetkili olduğunuz cohort’ların ilerleme özeti yenilendi.',
      '/cohort-analytics',
      ctx.pastDate(0, 3),
    );
  }

  // ── Platform yöneticileri ──────────────────────────────────────────────
  for (const admin of users.filter((user) => user.roles.includes('PLATFORM_ADMIN'))) {
    push(
      admin.id,
      'system',
      'Denetim kaydı arşivlendi',
      'Son 30 günün denetim kayıtları başarıyla arşivlendi.',
      '/audit-log',
      ctx.pastDate(0, 2),
    );
    push(
      admin.id,
      'session_terminated',
      'Bir sınav oturumu sonlandırıldı',
      'Bağlantı kaybı nedeniyle sonlandırılan oturum incelenmeli.',
      '/audit-log',
      ctx.pastDate(1, 5),
      true,
    );
  }

  return notifications.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

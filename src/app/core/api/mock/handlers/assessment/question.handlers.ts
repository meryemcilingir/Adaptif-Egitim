import { AuditAction } from '../../../../observability/audit.model';
import {
  COGNITIVE_LEVELS,
  DIFFICULTIES,
  PublishState,
} from '../../../../../features/adaptive-learning/models/common.model';
import {
  QUESTION_LIMITS,
  QUESTION_TYPES,
  QUESTION_TYPE_META,
  Question,
  QuestionAttachment,
  QuestionComment,
  QuestionCommentAction,
  QuestionMatchPair,
  QuestionOption,
  QuestionReviewStatus,
  QuestionSequenceItem,
  QuestionVersion,
} from '../../../../../features/adaptive-learning/models/question.model';
import {
  canCreateNewVersion,
  canDecideReview,
  canPublishQuestion,
  canResubmitForReview,
  canSubmitForReview,
  isQuestionEditable,
  questionEditBlockedReason,
  validateAnswerShape,
} from '../../../../../features/adaptive-learning/domain/question.rules';
import { label as stateLabel } from '../../../../../features/adaptive-learning/domain/publish-workflow';
import { sanitizeRichText, richTextLength } from '../../../../../shared/utils/rich-text.util';
import { equals, inList, includesId } from '../../db/query-engine';
import { businessRule, notFound, validation } from '../../mock-errors';
import { isWithinScope, requirePermission } from '../../mock-auth';
import { MockCaller, MockContext, MockHandler, created, ok } from '../../mock-router';
import { writeAudit } from '../audit-writer';
import { createCrudHandlers, diffFields } from '../crud/crud-handlers';
import { FieldValidator, readNumber, readStringArray, readText } from '../crud/field-validator';
import { buildQuestionDetail, questionAuthorName } from './question-detail';
// (Yorumlar `buildQuestionDetail` içinden `commentsOf` ile okunur — bkz. question-detail.ts.)

const TRANSITION_ACTIONS: Readonly<Record<PublishState, AuditAction>> = {
  DRAFT: 'question.restored',
  REVIEW: 'question.updated',
  PUBLISHED: 'question.published',
  ARCHIVED: 'question.archived',
};

/**
 * Soru bankası uç noktaları.
 *
 * Ortak CRUD + yayın iş akışı `createCrudHandlers`'tan gelir. Soruya ÖZGÜ olan
 * versiyonlama, favori, kopyalama, yumuşak silme ve toplu işlemler burada tanımlıdır.
 *
 * SIRA ÖNEMLİ: özgül yollar (`/questions/bulk`) `:id` kalıbından önce gelir.
 */
export const QUESTION_HANDLERS: readonly MockHandler[] = [
  /* ── Toplu işlemler ─────────────────────────────────────────────────── */
  {
    method: 'POST',
    path: '/api/questions/bulk',
    handle: (context) => {
      const caller = requirePermission(context, 'question:write');
      const body = context.body as { ids?: unknown; action?: unknown } | null;

      const ids = Array.isArray(body?.ids)
        ? body.ids.filter((id): id is string => typeof id === 'string')
        : [];
      const action = String(body?.action ?? '');

      if (ids.length === 0) throw validation('İşlem uygulanacak soru seçilmedi.');
      if (!['publish', 'archive', 'restore', 'delete'].includes(action)) {
        throw validation('Geçersiz toplu işlem türü.');
      }

      const questions = context.db.collection('questions');
      const succeeded: string[] = [];
      const failed: { id: string; title: string; reason: string }[] = [];
      const nowIso = new Date(context.now).toISOString();

      for (const id of ids) {
        const question = questions.findById(id);
        if (!question || question.deletedAt !== null) {
          failed.push({ id, title: id, reason: 'Soru bulunamadı.' });
          continue;
        }
        if (!isWithinScope(caller, { courseId: question.courseId })) {
          failed.push({ id, title: question.title, reason: 'Bu soru kapsamınız dışında.' });
          continue;
        }

        if (action === 'delete') {
          // Yumuşak silme: kayıt korunur, sınav geçmişi kopmaz (BR-36).
          if (question.state === 'PUBLISHED') {
            failed.push({
              id,
              title: question.title,
              reason: 'Yayındaki soru silinemez; önce arşivleyin.',
            });
            continue;
          }
          questions.update(id, { deletedAt: nowIso, updatedBy: caller.userId, updatedAt: nowIso });
          succeeded.push(id);
          continue;
        }

        const target: PublishState =
          action === 'publish' ? 'PUBLISHED' : action === 'archive' ? 'ARCHIVED' : 'DRAFT';

        const result = applyTransition(context, caller, question, target);
        if (result.ok) succeeded.push(id);
        else failed.push({ id, title: question.title, reason: result.reason });
      }

      return ok({ succeeded, failed });
    },
  },

  {
    /** Dışa aktarma — seçili sorular JSON olarak döner, istemci dosyaya yazar. */
    method: 'POST',
    path: '/api/questions/export',
    handle: (context) => {
      const caller = requirePermission(context, 'question:read');
      const ids = readStringArray(context.body, 'ids');

      const questions = context.db
        .collection('questions')
        .filter(
          (question) =>
            question.deletedAt === null &&
            (ids.length === 0 || ids.includes(question.id)) &&
            isWithinScope(caller, { courseId: question.courseId }),
        );

      return ok({
        exportedAt: new Date(context.now).toISOString(),
        count: questions.length,
        questions: questions.map(toExportRow),
      });
    },
  },

  {
    /**
     * İçe aktarma ÖNİZLEMESİ (mock).
     *
     * Kayıt yazmaz; satır satır neyin geçerli olduğunu döner. Gerçek içe aktarma
     * sınav modülüyle birlikte gelecek, sözleşme bugünden sabit.
     */
    method: 'POST',
    path: '/api/questions/import/preview',
    handle: (context) => {
      requirePermission(context, 'question:write');
      const rows = Array.isArray((context.body as { rows?: unknown } | null)?.rows)
        ? ((context.body as { rows: unknown[] }).rows as Record<string, unknown>[])
        : [];

      if (rows.length === 0) throw validation('İçe aktarılacak satır bulunamadı.');

      const existingCodes = new Set(
        context.db
          .collection('questions')
          .all()
          .map((question) => question.code.toLowerCase()),
      );

      const preview = rows.map((row, index) => {
        const code = readText(row, 'code');
        const title = readText(row, 'title');
        const type = readText(row, 'type');

        const message = !code
          ? 'Soru kodu boş olamaz.'
          : existingCodes.has(code.toLowerCase())
            ? 'Bu kod zaten kullanılıyor.'
            : title.length < QUESTION_LIMITS.title.min
              ? `Başlık en az ${QUESTION_LIMITS.title.min} karakter olmalıdır.`
              : !QUESTION_TYPES.includes(type as never)
                ? 'Soru türü tanınmadı.'
                : 'İçe aktarılmaya hazır.';

        return {
          line: index + 1,
          code,
          title,
          type,
          valid: message === 'İçe aktarılmaya hazır.',
          message,
        };
      });

      return ok({
        total: preview.length,
        valid: preview.filter((row) => row.valid).length,
        rows: preview,
      });
    },
  },

  /* ── Ortak CRUD + yayın akışı ───────────────────────────────────────── */
  ...createCrudHandlers<Question>({
    collection: 'questions',
    basePath: '/api/questions',
    entityLabel: 'Soru',
    auditType: 'Question',
    permissions: {
      read: 'question:read',
      write: 'question:write',
      publish: 'question:publish',
    },

    query: (context) => {
      const flagged = new Set(
        context.db
          .collection('itemAnalyses')
          .filter((analysis) => analysis.flags.length > 0)
          .map((analysis) => analysis.questionId),
      );
      const callerId = context.caller?.userId ?? '';

      return {
        searchable: (question: Question) => [
          question.code,
          question.title,
          question.stem,
          ...question.tags,
        ],
        filters: {
          courseId: equals<Question>((question) => question.courseId),
          outcomeId: includesId<Question>((question) => question.outcomeIds),
          type: inList<Question>((question) => question.type),
          difficulty: inList<Question>((question) => question.difficulty),
          level: inList<Question>((question) => question.level),
          state: inList<Question>((question) => question.state),
          reviewStatus: inList<Question>((question) => question.reviewStatus),
          tags: includesId<Question>((question) => question.tags),
          favoriteOnly: (question, value) =>
            isTrue(value) ? question.favoritedBy.includes(callerId) : true,
          flaggedOnly: (question, value) => (isTrue(value) ? flagged.has(question.id) : true),
        },
        sorters: {
          points: (question) => question.points,
          estimatedSolveTimeSeconds: (question) => question.estimatedSolveTimeSeconds,
          usageCount: (question) => question.usageCount,
          versionNumber: (question) => question.versionNumber,
        },
        defaultSort: { field: 'updatedAt', direction: 'desc' },
      };
    },

    // Yumuşak silinmiş sorular hiçbir listede görünmez.
    scope: (caller, question) =>
      question.deletedAt === null && isWithinScope(caller, { courseId: question.courseId }),

    labelOf: (question) => `${question.code} · ${question.title}`,

    create: (context, caller) => {
      validate(context, null);
      const now = new Date(context.now).toISOString();

      return {
        id: `qst_${context.now.toString(36)}`,
        ...writableFields(context),
        state: 'DRAFT',
        reviewStatus: 'NONE',
        rubricId: null,
        versionNumber: 1,
        pendingChangeNote: null,
        publishedVersion: null,
        usageCount: 0,
        favoritedBy: [],
        archivedAt: null,
        deletedAt: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
        createdBy: caller.userId,
        updatedBy: caller.userId,
      } as unknown as Question;
    },

    update: (existing, context, caller) => {
      /*
       * Yayındaki/incelemedeki/onaylanmış soru düzenlenemez (BR-02) — fabrika
       * yalnızca genel `isEditable` (DRAFT/REVIEW) kontrolünü yapar; soruya
       * özgü kural (yalnızca DRAFT ve REVISION_REQUESTED) burada tekrar
       * doğrulanır çünkü `REVIEW` durumunun çoğu alt hâli artık kilitlidir.
       */
      if (!isQuestionEditable(existing.state, existing.reviewStatus)) {
        throw businessRule(questionEditBlockedReason(existing.state, existing.reviewStatus));
      }
      validate(context, existing.id);

      return {
        ...existing,
        ...writableFields(context),
        version: existing.version + 1,
        updatedAt: new Date(context.now).toISOString(),
        updatedBy: caller.userId,
      };
    },

    changesOf: (before, after) =>
      diffFields(before, after, [
        { key: 'code', label: 'Kod' },
        { key: 'title', label: 'Başlık' },
        { key: 'stem', label: 'Soru gövdesi' },
        { key: 'type', label: 'Soru türü' },
        { key: 'difficulty', label: 'Zorluk' },
        { key: 'level', label: 'Bloom seviyesi' },
        { key: 'points', label: 'Puan' },
        { key: 'estimatedSolveTimeSeconds', label: 'Tahmini süre (sn)' },
        { key: 'explanation', label: 'Açıklama' },
        { key: 'tags', label: 'Etiketler' },
        { key: 'outcomeIds', label: 'Kazanımlar' },
      ]),

    assertDeletable: (question) => {
      if (question.usageCount > 0) {
        throw businessRule(
          `Bu soru ${question.usageCount} sınavda kullanılmış. Silmek yerine arşivleyin.`,
          { usageCount: question.usageCount },
        );
      }
    },

    assertPublishable: (question, context) => {
      /*
       * Ölçme uzmanı onayı ŞARTTIR (Approved → Published) — bu kontrol
       * olmadan bir soru incelemeden geçmeden doğrudan yayına alınabilirdi.
       */
      if (!canPublishQuestion(question.state, question.reviewStatus)) {
        throw businessRule('Soru yayına alınmadan önce ölçme uzmanı tarafından onaylanmalıdır.');
      }

      const issues = validateAnswerShape(question);
      if (issues.length > 0) {
        throw businessRule(`Soru yayına alınamaz: ${issues[0]!.message}`, { issues });
      }

      const outcomes = context.db.collection('outcomes');
      const missing = question.outcomeIds.filter((id) => outcomes.findById(id) === undefined);
      if (question.outcomeIds.length === 0 || missing.length > 0) {
        throw businessRule('Soru en az bir geçerli kazanıma bağlı olmalıdır.');
      }
    },

    auditActions: {
      created: 'question.created',
      updated: 'question.updated',
      deleted: 'question.deleted',
      transition: (target) => TRANSITION_ACTIONS[target],
    },

    afterChange: (context) => {
      // Yayına alınan her soru için değişmez bir snapshot yazılır (BR-03).
      snapshotNewlyPublished(context);
      // İncelemeden çıkan (yayınlanan, taslağa çekilen, arşivlenen) sorunun
      // inceleme alt durumu artık anlamsızdır — sıfırlanır.
      reconcileReviewStatus(context);
    },
  }),

  /* ── Soruya özgü uç noktalar ────────────────────────────────────────── */
  {
    /** Detay ekranı: soru + kazanımlar + versiyonlar + istatistik + kullanım. */
    method: 'GET',
    path: '/api/questions/:id/detail',
    handle: (context) => {
      const caller = requirePermission(context, 'question:read');
      const question = findQuestion(context);
      assertScope(caller, question);

      return ok(buildQuestionDetail(context.db, question, caller.userId));
    },
  },

  {
    method: 'GET',
    path: '/api/questions/:id/versions',
    handle: (context) => {
      const caller = requirePermission(context, 'question:read');
      const question = findQuestion(context);
      assertScope(caller, question);

      return ok(versionsOf(context, question.id));
    },
  },

  {
    /**
     * Yeni versiyon oluşturur (BR-02).
     *
     * Yayındaki sorunun mevcut hâli snapshot olarak korunur, soru taslağa döner
     * ve versiyon numarası artar. Böylece geçmiş sınavlar eski snapshot'ı
     * kullanmaya devam eder (BR-03).
     */
    method: 'POST',
    path: '/api/questions/:id/versions',
    handle: (context) => {
      const caller = requirePermission(context, 'question:write');
      const question = findQuestion(context);
      assertScope(caller, question);

      if (!canCreateNewVersion(question.state)) {
        throw businessRule(
          'Yeni versiyon yalnızca yayındaki bir soru için oluşturulabilir. Taslak sorular doğrudan düzenlenir.',
          { state: question.state },
        );
      }

      const changeNote = readText(context.body, 'changeNote');
      new FieldValidator(context.body as Record<string, unknown> | null)
        .text('changeNote', 'Değişiklik notu', QUESTION_LIMITS.changeNote)
        .assert();

      const nowIso = new Date(context.now).toISOString();
      const questions = context.db.collection('questions');

      /*
       * Mevcut yayınlanmış hâl korunur — ancak yalnızca henüz snapshot'ı yoksa.
       * Yayına alma sırasında zaten bir snapshot yazıldığı için burada koşulsuz
       * yazmak geçmişte aynı numaradan iki kayıt oluştururdu.
       */
      const alreadyCaptured = context.db
        .collection('questionVersions')
        .count(
          (item) =>
            item.questionId === question.id && item.versionNumber === question.versionNumber,
        );

      if (alreadyCaptured === 0) {
        writeSnapshot(context, question, question.versionNumber, changeNote, caller.userId);
      }

      const updated = questions.update(question.id, {
        state: 'DRAFT',
        versionNumber: question.versionNumber + 1,
        pendingChangeNote: changeNote,
        version: question.version + 1,
        updatedAt: nowIso,
        updatedBy: caller.userId,
      })!;

      writeAudit(context, caller, 'question.versioned', questionTarget(updated), changeNote);
      return created(updated);
    },
  },

  {
    /** İki versiyonun karşılaştırılabilmesi için ham veriyi döner. */
    method: 'GET',
    path: '/api/questions/:id/versions/compare',
    handle: (context) => {
      const caller = requirePermission(context, 'question:read');
      const question = findQuestion(context);
      assertScope(caller, question);

      const versions = versionsOf(context, question.id);
      const from = Number(context.query.get('from'));
      const to = Number(context.query.get('to'));

      const fromVersion = versions.find((item) => item.versionNumber === from);
      const toVersion = versions.find((item) => item.versionNumber === to);

      if (!fromVersion || !toVersion) {
        throw validation('Karşılaştırılacak versiyonlardan biri bulunamadı.');
      }

      return ok({ from: fromVersion, to: toVersion });
    },
  },

  {
    /** Soruyu kopyalar — yeni kayıt daima taslak ve favorisiz başlar. */
    method: 'POST',
    path: '/api/questions/:id/duplicate',
    handle: (context) => {
      const caller = requirePermission(context, 'question:write');
      const source = findQuestion(context);
      assertScope(caller, source);

      const questions = context.db.collection('questions');
      const nowIso = new Date(context.now).toISOString();

      const copy: Question = {
        ...source,
        id: `qst_${context.now.toString(36)}`,
        code: uniqueCode(context, source.code),
        title: `${source.title} (kopya)`,
        state: 'DRAFT',
        reviewStatus: 'NONE',
        versionNumber: 1,
        pendingChangeNote: null,
        publishedVersion: null,
        usageCount: 0,
        favoritedBy: [],
        archivedAt: null,
        deletedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        version: 1,
        createdBy: caller.userId,
        updatedBy: caller.userId,
      };

      questions.insert(copy);
      writeAudit(context, caller, 'question.duplicated', questionTarget(copy), `Kaynak: ${source.code}`);

      return created(copy);
    },
  },

  {
    /** Favoriye ekler/çıkarır. Favori kullanıcıya özeldir. */
    method: 'PUT',
    path: '/api/questions/:id/favorite',
    handle: (context) => {
      const caller = requirePermission(context, 'question:read');
      const question = findQuestion(context);
      assertScope(caller, question);

      const favorite = (context.body as { favorite?: unknown } | null)?.favorite === true;
      const others = question.favoritedBy.filter((id) => id !== caller.userId);

      const updated = context.db.collection('questions').update(question.id, {
        favoritedBy: favorite ? [...others, caller.userId] : others,
      })!;

      return ok(updated);
    },
  },

  {
    /** Yumuşak silme — kayıt korunur, listelerden düşer (BR-36). */
    method: 'POST',
    path: '/api/questions/:id/soft-delete',
    handle: (context) => {
      const caller = requirePermission(context, 'question:write');
      const question = findQuestion(context);
      assertScope(caller, question);

      if (question.state === 'PUBLISHED') {
        throw businessRule('Yayındaki soru silinemez; önce arşivleyin.');
      }

      const nowIso = new Date(context.now).toISOString();
      const updated = context.db.collection('questions').update(question.id, {
        deletedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: caller.userId,
      })!;

      writeAudit(context, caller, 'question.deleted', questionTarget(updated), null);
      return ok(updated);
    },
  },

  {
    /** Silinen soruyu geri getirir. */
    method: 'POST',
    path: '/api/questions/:id/restore',
    handle: (context) => {
      const caller = requirePermission(context, 'question:write');
      const questions = context.db.collection('questions');
      const question = questions.findById(context.params['id'] ?? '');
      if (!question) throw notFound('Soru');
      assertScope(caller, question);

      if (question.deletedAt === null) {
        throw businessRule('Bu soru zaten silinmemiş.');
      }

      const nowIso = new Date(context.now).toISOString();
      const updated = questions.update(question.id, {
        deletedAt: null,
        state: 'DRAFT',
        reviewStatus: 'NONE',
        archivedAt: null,
        updatedAt: nowIso,
        updatedBy: caller.userId,
      })!;

      writeAudit(context, caller, 'question.restored', questionTarget(updated), null);
      return ok(updated);
    },
  },

  /* ── İnceleme akışı (Draft → Under Review → Revision Requested → Approved → Published) ── */
  {
    /**
     * Eğitmen taslak soruyu incelemeye gönderir.
     *
     * Genel yayın geçiş uç noktası (`/transition`) BİLEREK kullanılmaz: o uç
     * `question:publish` ister ve bu izin yalnızca Ölçme Uzmanı'ndadır — bir
     * eğitmenin KENDİ taslağını incelemeye göndermesi "yayınlama" değildir,
     * `question:write` yeterli olmalıdır.
     */
    method: 'POST',
    path: '/api/questions/:id/submit-review',
    handle: (context) => {
      const caller = requirePermission(context, 'question:write');
      const question = findQuestion(context);
      assertScope(caller, question);

      if (!canSubmitForReview(question.state)) {
        throw businessRule('Yalnızca taslak durumdaki bir soru incelemeye gönderilebilir.', {
          state: question.state,
        });
      }

      const updated = transitionToReview(context, caller, question, 'UNDER_REVIEW');
      writeComment(context, caller, updated, 'submitted', optionalComment(context));
      writeAudit(context, caller, 'question.submitted_review', questionTarget(updated), null);

      return ok(updated);
    },
  },

  {
    /** Revizyon istenen soru düzeltildikten sonra eğitmen tarafından yeniden gönderilir. */
    method: 'POST',
    path: '/api/questions/:id/resubmit-review',
    handle: (context) => {
      const caller = requirePermission(context, 'question:write');
      const question = findQuestion(context);
      assertScope(caller, question);

      if (!canResubmitForReview(question.state, question.reviewStatus)) {
        throw businessRule('Yalnızca revizyon istenen bir soru yeniden incelemeye gönderilebilir.', {
          state: question.state,
          reviewStatus: question.reviewStatus,
        });
      }

      const updated = transitionToReview(context, caller, question, 'UNDER_REVIEW');
      writeComment(context, caller, updated, 'resubmitted', optionalComment(context));
      writeAudit(context, caller, 'question.resubmitted', questionTarget(updated), null);

      return ok(updated);
    },
  },

  {
    /** Ölçme uzmanı incelemedeki soruyu onaylar — yayına almak için ayrı bir adımdır. */
    method: 'POST',
    path: '/api/questions/:id/approve',
    handle: (context) => {
      const caller = requirePermission(context, 'question:publish');
      const question = findQuestion(context);
      assertScope(caller, question);

      if (!canDecideReview(question.state, question.reviewStatus)) {
        throw businessRule('Yalnızca incelemedeki bir soru onaylanabilir.', {
          state: question.state,
          reviewStatus: question.reviewStatus,
        });
      }

      const updated = setReviewStatus(context, caller, question, 'APPROVED');
      writeComment(context, caller, updated, 'approved', optionalComment(context));
      writeAudit(context, caller, 'question.approved', questionTarget(updated), null);

      return ok(updated);
    },
  },

  {
    /** Ölçme uzmanı düzeltme ister — gerekçe ZORUNLUDUR, eğitmen ne yapacağını bilmelidir. */
    method: 'POST',
    path: '/api/questions/:id/request-revision',
    handle: (context) => {
      const caller = requirePermission(context, 'question:publish');
      const question = findQuestion(context);
      assertScope(caller, question);

      if (!canDecideReview(question.state, question.reviewStatus)) {
        throw businessRule('Yalnızca incelemedeki bir soru için revizyon istenebilir.', {
          state: question.state,
          reviewStatus: question.reviewStatus,
        });
      }

      const message = requiredComment(context, 'Revizyon gerekçesi');
      const updated = setReviewStatus(context, caller, question, 'REVISION_REQUESTED');
      writeComment(context, caller, updated, 'revision_requested', message);
      writeAudit(context, caller, 'question.revision_requested', questionTarget(updated), message);

      return ok(updated);
    },
  },

  {
    /**
     * Ölçme uzmanı soruyu reddeder.
     *
     * Sonuç durumu "revizyon istendi" ile AYNIDIR (RolesPermissions.md altı
     * durumlu modelde ayrı bir "Reddedildi" durumu yoktur) — fark yalnızca
     * yorum akışındaki eylem etiketinde görünür, eğitmen soruyu yine
     * düzeltip yeniden gönderebilir.
     */
    method: 'POST',
    path: '/api/questions/:id/reject',
    handle: (context) => {
      const caller = requirePermission(context, 'question:publish');
      const question = findQuestion(context);
      assertScope(caller, question);

      if (!canDecideReview(question.state, question.reviewStatus)) {
        throw businessRule('Yalnızca incelemedeki bir soru reddedilebilir.', {
          state: question.state,
          reviewStatus: question.reviewStatus,
        });
      }

      const message = requiredComment(context, 'Red gerekçesi');
      const updated = setReviewStatus(context, caller, question, 'REVISION_REQUESTED');
      writeComment(context, caller, updated, 'rejected', message);
      writeAudit(context, caller, 'question.rejected', questionTarget(updated), message);

      return ok(updated);
    },
  },

  {
    /** Yazar veya inceleyen — kapsamı içindeyse — soruya serbest yorum bırakabilir. */
    method: 'POST',
    path: '/api/questions/:id/comments',
    handle: (context) => {
      const caller = requirePermission(context, 'question:read');
      const question = findQuestion(context);
      assertScope(caller, question);

      const message = requiredComment(context, 'Yorum');
      const comment = writeComment(context, caller, question, 'comment', message);

      return created(comment);
    },
  },
];

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function isTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

function findQuestion(context: MockContext): Question {
  const question = context.db.collection('questions').findById(context.params['id'] ?? '');
  if (!question || question.deletedAt !== null) throw notFound('Soru');
  return question;
}

function assertScope(caller: MockCaller, question: Question): void {
  if (!isWithinScope(caller, { courseId: question.courseId })) {
    throw businessRule('Bu soru kapsamınız dışında.');
  }
}

/* ── İnceleme akışı yardımcıları ─────────────────────────────────────────── */

/** DRAFT/REVISION_REQUESTED → REVIEW geçişi; state DEĞİŞİR (submit/resubmit). */
function transitionToReview(
  context: MockContext,
  caller: MockCaller,
  question: Question,
  reviewStatus: QuestionReviewStatus,
): Question {
  return context.db.collection('questions').update(question.id, {
    state: 'REVIEW',
    reviewStatus,
    version: question.version + 1,
    updatedAt: new Date(context.now).toISOString(),
    updatedBy: caller.userId,
  })!;
}

/** REVIEW içindeki alt durum değişikliği (approve/revision-request/reject) — state SABİT kalır. */
function setReviewStatus(
  context: MockContext,
  caller: MockCaller,
  question: Question,
  reviewStatus: QuestionReviewStatus,
): Question {
  return context.db.collection('questions').update(question.id, {
    reviewStatus,
    version: question.version + 1,
    updatedAt: new Date(context.now).toISOString(),
    updatedBy: caller.userId,
  })!;
}

function optionalComment(context: MockContext): string {
  return readText(context.body, 'message');
}

/** Gerekçe zorunlu eylemlerde (revizyon/red/yorum) çağrılır — boşsa 400 döner. */
function requiredComment(context: MockContext, label: string): string {
  const message = readText(context.body, 'message');
  new FieldValidator(context.body as Record<string, unknown> | null)
    .text('message', label, QUESTION_LIMITS.commentMessage)
    .assert();
  return message;
}

function writeComment(
  context: MockContext,
  caller: MockCaller,
  question: Question,
  action: QuestionCommentAction,
  message: string,
): QuestionComment {
  const comment: QuestionComment = {
    id: `qcm_${context.now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    questionId: question.id,
    action,
    message,
    authorId: caller.userId,
    authorName: questionAuthorName(context.db, caller.userId),
    authorRole: caller.role,
    createdAt: new Date(context.now).toISOString(),
  };

  context.db.collection('questionComments').insert(comment);
  return comment;
}

/**
 * `REVIEW`den çıkan (yayınlanan, taslağa çekilen, arşivlenen) sorunun inceleme
 * alt durumu artık anlamsızdır. Genel yayın geçiş uç noktası (`/transition`,
 * `crud-handlers.ts`) bu alanı bilmediği için ekstra alan güncellemesi
 * yapamaz; bu yüzden her değişiklikten sonra tarama ile düzeltilir — aynı
 * desen `snapshotNewlyPublished` için de kullanılır.
 */
function reconcileReviewStatus(context: MockContext): void {
  const questions = context.db.collection('questions');

  for (const question of questions.filter(
    (item) => item.state !== 'REVIEW' && item.reviewStatus !== 'NONE',
  )) {
    questions.update(question.id, { reviewStatus: 'NONE' });
  }
}

function versionsOf(context: MockContext, questionId: string): QuestionVersion[] {
  return context.db
    .collection('questionVersions')
    .filter((version) => version.questionId === questionId)
    .sort((a, b) => b.versionNumber - a.versionNumber);
}

/** Gövdeden okunan, kullanıcı tarafından düzenlenebilir alanlar (create/update ortak). */
function writableFields(context: MockContext) {
  const body = context.body as Record<string, unknown> | null;
  const type = readText(body, 'type') as Question['type'];
  const meta = QUESTION_TYPE_META[type] ?? QUESTION_TYPE_META.single_choice;

  return {
    code: readText(body, 'code').toLocaleUpperCase('tr-TR'),
    title: readText(body, 'title'),
    stem: sanitizeRichText(readText(body, 'stem')),
    type,
    courseId: readText(body, 'courseId'),
    outcomeIds: readStringArray(body, 'outcomeIds'),
    difficulty: readText(body, 'difficulty') as Question['difficulty'],
    level: readText(body, 'level') as Question['level'],
    points: readNumber(body, 'points', meta.defaultPoints),
    estimatedSolveTimeSeconds: readNumber(body, 'estimatedSolveTimeSeconds', 60),
    options: readOptions(body),
    matchPairs: readMatchPairs(body),
    sequenceItems: readSequenceItems(body),
    expectedAnswer: readText(body, 'expectedAnswer') || null,
    numericTolerance:
      body?.['numericTolerance'] === null || body?.['numericTolerance'] === undefined
        ? null
        : readNumber(body, 'numericTolerance', 0),
    explanation: readText(body, 'explanation'),
    attachments: readAttachments(body),
    tags: readStringArray(body, 'tags'),
    allowPartialCredit: body?.['allowPartialCredit'] === true,
  };
}

function readRows(body: Record<string, unknown> | null, field: string): Record<string, unknown>[] {
  const value = body?.[field];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  );
}

function readOptions(body: Record<string, unknown> | null): QuestionOption[] {
  return readRows(body, 'options')
    .map((row, index) => ({
      id: readText(row, 'id') || `opt_${index}`,
      text: readText(row, 'text'),
      correct: row['correct'] === true,
      rationale: readText(row, 'rationale'),
    }))
    .filter((option) => option.text.length > 0);
}

function readMatchPairs(body: Record<string, unknown> | null): QuestionMatchPair[] {
  return readRows(body, 'matchPairs')
    .map((row, index) => ({
      id: readText(row, 'id') || `mtc_${index}`,
      left: readText(row, 'left'),
      right: readText(row, 'right'),
    }))
    .filter((pair) => pair.left.length > 0 || pair.right.length > 0);
}

function readSequenceItems(body: Record<string, unknown> | null): QuestionSequenceItem[] {
  return readRows(body, 'sequenceItems')
    .map((row, index) => ({
      id: readText(row, 'id') || `seq_${index}`,
      text: readText(row, 'text'),
      order: Number(row['order'] ?? index + 1),
    }))
    .filter((item) => item.text.length > 0);
}

function readAttachments(body: Record<string, unknown> | null): QuestionAttachment[] {
  return readRows(body, 'attachments')
    .map((row, index) => ({
      id: readText(row, 'id') || `att_${index}`,
      kind: (readText(row, 'kind') || 'image') as QuestionAttachment['kind'],
      url: readText(row, 'url'),
      name: readText(row, 'name'),
    }))
    .filter((attachment) => attachment.url.length > 0);
}

function validate(context: MockContext, currentId: string | null): void {
  const body = context.body as Record<string, unknown> | null;
  const questions = context.db.collection('questions');
  const outcomes = context.db.collection('outcomes');
  const courseId = readText(body, 'courseId');
  const outcomeIds = readStringArray(body, 'outcomeIds');

  const validator = new FieldValidator(body)
    .text('code', 'Soru kodu', QUESTION_LIMITS.code)
    .unique('code', 'Soru kodu', (value) =>
      questions
        .all()
        .some(
          (question) =>
            question.id !== currentId &&
            question.deletedAt === null &&
            question.code.toLocaleLowerCase('tr-TR') === value.toLocaleLowerCase('tr-TR'),
        ),
    )
    .text('title', 'Soru başlığı', QUESTION_LIMITS.title)
    .oneOf('type', 'Soru türü', QUESTION_TYPES)
    .reference(
      'courseId',
      'Ders',
      (id) => context.db.collection('courses').findById(id) !== undefined,
    )
    .oneOf('difficulty', 'Zorluk', DIFFICULTIES)
    .oneOf('level', 'Bloom seviyesi', COGNITIVE_LEVELS)
    .integer('points', 'Puan', QUESTION_LIMITS.points)
    .integer(
      'estimatedSolveTimeSeconds',
      'Tahmini çözüm süresi',
      QUESTION_LIMITS.estimatedSolveTimeSeconds,
    )
    .tags('tags', 'Etiket', {
      max: QUESTION_LIMITS.tagCount.max,
      itemMax: QUESTION_LIMITS.tag.max,
    })
    // Zengin metin uzunluğu DÜZ METİN üzerinden ölçülür; etiketler sayılmaz.
    .custom(
      'stem',
      `Soru gövdesi zorunludur ve en fazla ${QUESTION_LIMITS.stem.max} karakter olabilir.`,
      isRichTextValid(readText(body, 'stem'), QUESTION_LIMITS.stem.max, true),
    )
    .custom(
      'explanation',
      `Açıklama en fazla ${QUESTION_LIMITS.explanation.max} karakter olabilir.`,
      isRichTextValid(readText(body, 'explanation'), QUESTION_LIMITS.explanation.max, false),
    )
    .custom(
      'outcomeIds',
      `Soru en az ${QUESTION_LIMITS.outcomeCount.min}, en fazla ${QUESTION_LIMITS.outcomeCount.max} kazanıma bağlanabilir.`,
      outcomeIds.length >= QUESTION_LIMITS.outcomeCount.min &&
        outcomeIds.length <= QUESTION_LIMITS.outcomeCount.max,
    )
    .custom(
      'outcomeIds',
      'Seçilen kazanımlardan bazıları bu derse ait değil.',
      outcomeIds.every((id) => outcomes.findById(id)?.courseId === courseId),
    )
    .custom(
      'attachments',
      `En fazla ${QUESTION_LIMITS.attachmentCount.max} ek eklenebilir.`,
      readAttachments(body).length <= QUESTION_LIMITS.attachmentCount.max,
    );

  // Cevap yapısı kuralları istemciyle AYNI saf fonksiyondan gelir.
  for (const issue of validateAnswerShape({
    type: readText(body, 'type') as Question['type'],
    options: readOptions(body),
    matchPairs: readMatchPairs(body),
    sequenceItems: readSequenceItems(body),
    expectedAnswer: readText(body, 'expectedAnswer') || null,
  })) {
    validator.custom(issue.field, issue.message, false);
  }

  validator.assert();
}

function isRichTextValid(html: string, max: number, required: boolean): boolean {
  const length = richTextLength(html);
  if (required && length === 0) return false;
  return length <= max;
}

/** Kopyalanan soruya çakışmayan bir kod üretir. */
function uniqueCode(context: MockContext, baseCode: string): string {
  const questions = context.db.collection('questions').all();
  const taken = new Set(questions.map((question) => question.code.toLocaleLowerCase('tr-TR')));

  for (let suffix = 1; suffix < 100; suffix++) {
    const candidate = `${baseCode}-K${suffix}`.slice(0, QUESTION_LIMITS.code.max);
    if (!taken.has(candidate.toLocaleLowerCase('tr-TR'))) return candidate;
  }
  return `${baseCode}-${Date.now().toString(36)}`.slice(0, QUESTION_LIMITS.code.max);
}

/**
 * Toplu işlemde tek bir geçişi uygular.
 * Tekil `POST /:id/transition` ile aynı kuralları kullanır; farkı, hata fırlatmak
 * yerine gerekçeyi döndürmesidir (kısmi başarı raporlanabilsin diye).
 */
function applyTransition(
  context: MockContext,
  caller: MockCaller,
  question: Question,
  target: PublishState,
): { ok: true } | { ok: false; reason: string } {
  const questions = context.db.collection('questions');

  if (question.state === target) {
    return { ok: false, reason: `Soru zaten "${stateLabel(target)}" durumunda.` };
  }
  if (target === 'PUBLISHED') {
    if (question.state === 'ARCHIVED') {
      return { ok: false, reason: 'Arşivdeki soru doğrudan yayına alınamaz; önce taslağa alın.' };
    }
    if (!canPublishQuestion(question.state, question.reviewStatus)) {
      return { ok: false, reason: 'Soru yayına alınmadan önce ölçme uzmanı tarafından onaylanmalıdır.' };
    }
    const issues = validateAnswerShape(question);
    if (issues.length > 0) return { ok: false, reason: issues[0]!.message };
    if (question.outcomeIds.length === 0) {
      return { ok: false, reason: 'Soru bir kazanıma bağlı değil.' };
    }
  }

  const nowIso = new Date(context.now).toISOString();
  const updated = questions.update(question.id, {
    state: target,
    reviewStatus: target === 'REVIEW' ? question.reviewStatus : 'NONE',
    versionNumber: question.versionNumber,
    publishedVersion: target === 'PUBLISHED' ? question.versionNumber : question.publishedVersion,
    archivedAt: target === 'ARCHIVED' ? nowIso : null,
    version: question.version + 1,
    updatedAt: nowIso,
    updatedBy: caller.userId,
  })!;

  if (target === 'PUBLISHED') {
    writeSnapshot(context, updated, updated.versionNumber, 'Toplu yayınlama.', caller.userId);
  }
  writeAudit(context, caller, TRANSITION_ACTIONS[target], questionTarget(updated), null);

  return { ok: true };
}

/**
 * Yayına alınmış ama snapshot'ı olmayan soruları tamamlar.
 * Tekil geçiş `createCrudHandlers` içinde yapıldığı için kanca buradan çalışır.
 */
function snapshotNewlyPublished(context: MockContext): void {
  const questions = context.db.collection('questions');
  const versions = context.db.collection('questionVersions');

  for (const question of questions.filter((item) => item.state === 'PUBLISHED')) {
    const hasSnapshot = versions.count(
      (version) =>
        version.questionId === question.id && version.versionNumber === question.versionNumber,
    );
    if (hasSnapshot > 0) continue;

    if (question.publishedVersion !== question.versionNumber) {
      questions.update(question.id, { publishedVersion: question.versionNumber });
    }

    // Kullanıcının "yeni versiyon" adımında girdiği gerekçe burada kullanılır.
    writeSnapshot(
      context,
      question,
      question.versionNumber,
      question.pendingChangeNote ?? 'Yayına alındı.',
      question.updatedBy,
    );
    questions.update(question.id, { pendingChangeNote: null });
  }
}

function writeSnapshot(
  context: MockContext,
  question: Question,
  versionNumber: number,
  changeNote: string,
  publishedBy: string,
): void {
  const { usageCount: _usage, favoritedBy: _favorites, ...snapshot } = question;

  context.db.collection('questionVersions').insert({
    id: `qvr_${context.now.toString(36)}_${versionNumber}`,
    questionId: question.id,
    versionNumber,
    snapshot: { ...snapshot, versionNumber },
    changeNote: changeNote || 'Değişiklik notu girilmedi.',
    publishedBy,
    publishedByName: questionAuthorName(context.db, publishedBy),
    publishedAt: new Date(context.now).toISOString(),
  });
}

/** Dışa aktarma satırı — iç kimlikler yerine taşınabilir alanlar. */
function toExportRow(question: Question) {
  return {
    code: question.code,
    title: question.title,
    type: question.type,
    difficulty: question.difficulty,
    level: question.level,
    points: question.points,
    estimatedSolveTimeSeconds: question.estimatedSolveTimeSeconds,
    stem: question.stem,
    explanation: question.explanation,
    options: question.options.map((option) => ({
      text: option.text,
      correct: option.correct,
      rationale: option.rationale,
    })),
    matchPairs: question.matchPairs.map((pair) => ({ left: pair.left, right: pair.right })),
    sequenceItems: question.sequenceItems.map((item) => ({ text: item.text, order: item.order })),
    expectedAnswer: question.expectedAnswer,
    tags: question.tags,
    state: question.state,
    versionNumber: question.versionNumber,
  };
}

/** Denetim kaydında sorunun nasıl görüneceği. */
function questionTarget(question: Question) {
  return { type: 'Question', id: question.id, label: `${question.code} · ${question.title}` };
}

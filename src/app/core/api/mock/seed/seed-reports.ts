import { SavedReport } from '../../../../features/adaptive-learning/models/analytics.model';
import { MockUser } from '../db/db-schema';
import { SeedContext } from './seed-context';

/**
 * Örnek kayıtlı raporlar (§17, §18, §19).
 *
 * Amaç, rapor ekranlarının boş açılmaması ve widget mantığının nasıl
 * çalıştığının görülebilmesi. Raporlar KİŞİSELDİR; her demo rolüne kendi
 * işine yarayacak bir tane verilir — herkese aynı raporu vermek, kişisel
 * raporun ne işe yaradığını gizlerdi.
 *
 * Zamanlanmış raporlarda gerçek bir zamanlayıcı yoktur; `nextRunAt` yalnızca
 * ekranda ne zaman çalışacağını göstermek içindir.
 */
export function seedSavedReports(ctx: SeedContext, users: readonly MockUser[]): SavedReport[] {
  const reports: SavedReport[] = [];

  const byEmail = (email: string) => users.find((user) => user.email === email);

  const instructor = byEmail('instructor@adaptif.dev');
  const manager = byEmail('manager@adaptif.dev');
  const specialist = byEmail('specialist@adaptif.dev');

  if (instructor) {
    reports.push({
      id: ctx.id('rpt'),
      name: 'Haftalık ders sağlığı',
      description:
        'Derslerimdeki tamamlama, sınav ortalaması ve risk altındaki öğrenciler.',
      ownerId: instructor.id,
      filters: { preset: 'last7' },
      widgets: [
        widget(ctx, 'kpi', 'Özet göstergeler', 'overview.metrics', 2),
        widget(ctx, 'trend', 'Sınav puanı eğilimi', 'trends.examScore', 2),
        widget(ctx, 'table', 'Risk altındaki öğrenciler', 'performers.atRisk', 1),
        widget(ctx, 'chart', 'Tamamlama eğilimi', 'trends.completion', 1),
      ],
      schedule: {
        frequency: 'weekly',
        dayOfPeriod: 1,
        hour: 8,
        recipients: [instructor.email],
        enabled: true,
        nextRunAt: nextMonday(ctx),
      },
      createdAt: ctx.date(-45),
      updatedAt: ctx.date(-3),
    });
  }

  if (manager) {
    reports.push({
      id: ctx.id('rpt'),
      name: 'Program karnesi',
      description: 'Program genelinde ustalık, kazanım kapsaması ve grup karşılaştırması.',
      ownerId: manager.id,
      filters: { preset: 'last30' },
      widgets: [
        widget(ctx, 'kpi', 'Program göstergeleri', 'overview.metrics', 2),
        widget(ctx, 'heatmap', 'Kazanım × ders ustalığı', 'mastery.matrix', 2),
        widget(ctx, 'chart', 'Ustalık eğilimi', 'trends.mastery', 1),
        widget(ctx, 'table', 'En başarılı öğrenciler', 'performers.top', 1),
      ],
      schedule: {
        frequency: 'monthly',
        dayOfPeriod: 1,
        hour: 9,
        recipients: [manager.email],
        enabled: true,
        nextRunAt: firstOfNextMonth(ctx),
      },
      createdAt: ctx.date(-60),
      updatedAt: ctx.date(-10),
    });
  }

  if (specialist) {
    reports.push({
      id: ctx.id('rpt'),
      name: 'Madde kalitesi izleme',
      description: 'Zorluk dağılımı, ayırt edicilik ve gözden geçirilmesi gereken maddeler.',
      ownerId: specialist.id,
      filters: { preset: 'last90' },
      widgets: [
        widget(ctx, 'chart', 'Zorluk dağılımı', 'difficulty.distribution', 1),
        widget(ctx, 'chart', 'Zorluk × ayırt edicilik', 'difficulty.scatter', 1),
        widget(ctx, 'table', 'İşaretli maddeler', 'items.flagged', 2),
      ],
      // Zamanlaması kapalı bir rapor: ekranın iki durumu da görülebilsin.
      schedule: null,
      createdAt: ctx.date(-20),
      updatedAt: ctx.date(-2),
    });
  }

  return reports;
}

function widget(
  ctx: SeedContext,
  kind: SavedReport['widgets'][number]['kind'],
  title: string,
  source: string,
  span: 1 | 2,
): SavedReport['widgets'][number] {
  return { id: ctx.id('wdg'), kind, title, source, span };
}

/** Bir sonraki pazartesi 08:00 — haftalık raporun çalışacağı an. */
/*
 * Zaman damgaları YEREL saate göre kurulur.
 *
 * Ekran "Pazartesi 08:00" yazıp altında yerel saate çevrilmiş bir zaman
 * gösterdiğinde ikisi çelişirdi; kayıt da yerel 08:00'i temsil eder.
 */
function nextMonday(ctx: SeedContext): string {
  const date = new Date(ctx.date(0));
  date.setHours(8, 0, 0, 0);

  const weekday = date.getDay() === 0 ? 7 : date.getDay();
  date.setDate(date.getDate() + ((1 - weekday + 7) % 7 || 7));

  return date.toISOString();
}

function firstOfNextMonth(ctx: SeedContext): string {
  const date = new Date(ctx.date(0));
  date.setHours(9, 0, 0, 0);
  date.setMonth(date.getMonth() + 1, 1);

  return date.toISOString();
}

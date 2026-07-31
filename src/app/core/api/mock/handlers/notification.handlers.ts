import { NotificationFeed } from '../../../../features/adaptive-learning/models/notification.model';
import { requireCaller } from '../mock-auth';
import { notFound } from '../mock-errors';
import { MockHandler, ok } from '../mock-router';

const FEED_LIMIT = 20;

/**
 * Bildirim akışı.
 *
 * Kullanıcı yalnızca KENDİ bildirimlerini okuyabilir; kimlik istemciden değil,
 * token'dan çözülen `caller` üzerinden alınır.
 */
export const NOTIFICATION_HANDLERS: readonly MockHandler[] = [
  {
    method: 'GET',
    path: '/api/notifications',
    handle: (context) => {
      const caller = requireCaller(context);

      const items = context.db
        .collection('notifications')
        .filter((notification) => notification.userId === caller.userId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

      const feed: NotificationFeed = {
        items: items.slice(0, FEED_LIMIT),
        unreadCount: items.filter((notification) => !notification.read).length,
      };
      return ok(feed);
    },
  },

  {
    method: 'POST',
    path: '/api/notifications/read-all',
    handle: (context) => {
      const caller = requireCaller(context);
      const collection = context.db.collection('notifications');

      for (const notification of collection.filter(
        (item) => item.userId === caller.userId && !item.read,
      )) {
        collection.update(notification.id, { read: true });
      }

      return ok({ unreadCount: 0 });
    },
  },

  {
    method: 'POST',
    path: '/api/notifications/:id/read',
    handle: (context) => {
      const caller = requireCaller(context);
      const collection = context.db.collection('notifications');
      const notification = collection.findById(context.params['id'] ?? '');

      // Başkasının bildirimi "bulunamadı" olarak döner — varlığı sızdırılmaz.
      if (!notification || notification.userId !== caller.userId) throw notFound('Bildirim');

      return ok(collection.update(notification.id, { read: true }));
    },
  },
];

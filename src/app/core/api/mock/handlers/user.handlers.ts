import { User } from '../../../../features/adaptive-learning/models/user.model';
import { equals, inList, includesId } from '../db/query-engine';
import { MockUser } from '../db/db-schema';
import { requirePermission } from '../mock-auth';
import { notFound } from '../mock-errors';
import { MockHandler, ok } from '../mock-router';

/**
 * Kullanıcı yönetimi uç noktaları.
 *
 * Parola alanı yanıt gövdesine ASLA konmaz; her kayıt `toPublicUser` ile
 * temizlenerek döner (tek çıkış noktası → unutma riski yok).
 */
export const USER_HANDLERS: readonly MockHandler[] = [
  {
    method: 'GET',
    path: '/api/users',
    handle: (context) => {
      requirePermission(context, 'admin:manage');

      const page = context.db.collection('users').query(context.page, {
        searchable: (user: MockUser) => [user.fullName, user.email, user.title],
        filters: {
          role: includesId<MockUser>((user) => user.roles),
          state: inList<MockUser>((user) => user.state),
          programId: equals<MockUser>((user) => user.programId),
        },
        defaultSort: { field: 'fullName', direction: 'asc' },
      });

      return ok({ ...page, items: page.items.map(toPublicUser) });
    },
  },

  {
    method: 'GET',
    path: '/api/users/:id',
    handle: (context) => {
      requirePermission(context, 'admin:manage');

      const user = context.db.collection('users').findById(context.params['id'] ?? '');
      if (!user) throw notFound('Kullanıcı');

      return ok(toPublicUser(user));
    },
  },
];

function toPublicUser(user: MockUser): User {
  const { password: _password, ...publicUser } = user;
  return publicUser;
}

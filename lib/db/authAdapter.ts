import type { Adapter, AdapterUser } from "@auth/core/adapters";
import { getMongoDbClient, type DbClient } from "./mongoClient";
import { COLLECTIONS } from "./collections";
import type { User } from "./schemas";
import { findUserByEmail, findUserById, createUser as createUserRow } from "./repositories/users";
import { findAccountByProviderAccountId, createAccount as createAccountRow } from "./repositories/accounts";

/**
 * Replaces `PrismaAdapter(db)` in auth.ts. NextAuth/Auth.js calls this
 * adapter internally during the OAuth sign-in flow — separately from, and in
 * addition to, the manual db calls that used to live in auth.ts's own
 * `signIn` callback. Missing this would have left a real Prisma/TCP call
 * live inside the app despite every other call site being migrated.
 *
 * Only implements what this app's actual config needs: two OAuth providers
 * (GitHub, Google — see auth.config.ts) and `session: { strategy: "jwt" }`.
 * That means Auth.js never needs session/verification-token/WebAuthn adapter
 * methods (those back database-session-strategy, the Email provider, and
 * passkeys respectively — none used here), so they're intentionally left
 * unimplemented, matching upstream PrismaAdapter's own scope for this app.
 *
 * Note: this app's `User` model has no `emailVerified` field. The previous
 * PrismaAdapter's `createUser` wrote `emailVerified` unconditionally via
 * `p.user.create(stripUndefined(data))`, which Prisma Client would reject at
 * the schema-validation layer — meaning that call likely never actually ran
 * in production (the custom signIn callback in auth.ts already creates the
 * user first, so by the time Auth.js's internal flow would call this
 * adapter's createUser, the account already resolves via getUserByAccount
 * instead). Data API has no such schema validation, so the field is simply
 * dropped by toUser() below rather than erroring either way — behavior is
 * either unchanged or an incidental fix of a dead path, not a regression.
 */
function toAdapterUser(user: User): AdapterUser {
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email,
    image: user.image ?? null,
    emailVerified: null,
  };
}

export function DataApiAdapter(client: DbClient = getMongoDbClient()): Adapter {
  return {
    async createUser(user) {
      const created = await createUserRow(
        { name: user.name, email: user.email, image: user.image },
        client
      );
      return toAdapterUser(created);
    },

    async getUser(id) {
      const user = await findUserById(id, client);
      return user ? toAdapterUser(user) : null;
    },

    async getUserByEmail(email) {
      const user = await findUserByEmail(email, client);
      return user ? toAdapterUser(user) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const account = await findAccountByProviderAccountId(provider, providerAccountId, client);
      if (!account) return null;
      const user = await findUserById(account.userId, client);
      return user ? toAdapterUser(user) : null;
    },

    async updateUser(user) {
      const updates: Record<string, unknown> = {};
      if (user.name !== undefined) updates.name = user.name;
      if (user.email !== undefined) updates.email = user.email;
      if (user.image !== undefined) updates.image = user.image;
      if (Object.keys(updates).length > 0) {
        await client.updateOne(COLLECTIONS.User, { _id: user.id }, { $set: updates });
      }
      const updated = await findUserById(user.id, client);
      if (!updated) throw new Error(`DataApiAdapter.updateUser: user ${user.id} not found after update`);
      return toAdapterUser(updated);
    },

    async linkAccount(account) {
      await createAccountRow(
        {
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          refreshToken: account.refresh_token ?? null,
          accessToken: account.access_token ?? null,
          expiresAt: account.expires_at ?? null,
          tokenType: account.token_type ?? null,
          scope: account.scope ?? null,
          idToken: account.id_token ?? null,
          sessionState: (account.session_state as string | undefined) ?? null,
        },
        client
      );
    },
  };
}

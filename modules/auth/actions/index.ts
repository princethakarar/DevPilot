"use server"

import { findUserByIdWithAccounts } from "@/lib/db/repositories/users"
import { findAccountByUserId, findAccountsByUserId, deleteAccountById } from "@/lib/db/repositories/accounts"
import { DbError } from "@/lib/db/mongoClient"

/**
 * Retries were originally tuned for Prisma's TCP driver disconnect strings
 * ("10054", "broken pipe", etc.), then re-targeted to HTTP 429/5xx during the
 * brief Atlas Data API detour. Now back to a native `mongodb` driver (Data
 * API was removed for new Atlas projects — see MIGRATION_INVENTORY.md), so
 * this retries what actually goes wrong over a real connection: transient
 * network/server-selection errors. `DbError.retryable` (lib/db/mongoClient.ts)
 * classifies those by driver error name/label instead of an HTTP status.
 */
async function retryQuery<T>(fn: () => Promise<T>, retries = 2, delay = 500): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      console.warn(`Database query failed (attempt ${i + 1}/${retries}):`, error.message || error);

      const isRetryable = error instanceof DbError && error.retryable;

      if (isRetryable && i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const getUserById = async (id: string) => {
    try {
        return await retryQuery(() => findUserByIdWithAccounts(id));
    } catch (error) {
        console.error("Error fetching user by ID:", error);
        return null;
    }
}

export const getAccountByUserId = async (userId: string) => {
    try {
        return await retryQuery(() => findAccountByUserId(userId));
    } catch(error) {
        console.error("Error fetching account by user ID:", error);
        return null;
    }
}

export const currentUser = async () => {
    const { auth } = await import("@/auth")
    const user = await auth();
    return user?.user;
}

export const disconnectProvider = async (providerName: string) => {
    try {
        const user = await currentUser();
        if (!user?.id) return { error: "Not authenticated" };

        const userAccounts = await findAccountsByUserId(user.id);

        const accountToDisconnect = userAccounts.find(acc => acc.provider === providerName);
        if (!accountToDisconnect) {
            return { error: `Profile ${providerName} is not connected` };
        }

        if (userAccounts.length <= 1) {
            return { error: "Cannot disconnect the only connected profile. At least one profile (Google or GitHub) must be linked to your account." };
        }

        await deleteAccountById(accountToDisconnect.id);

        return { success: true };
    } catch (error) {
        console.error("Error disconnecting provider:", error);
        return { error: "Failed to disconnect profile" };
    }
}
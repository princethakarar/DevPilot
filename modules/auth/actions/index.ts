"use server"

import {db} from "@/lib/db"

async function retryQuery<T>(fn: () => Promise<T>, retries = 2, delay = 500): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      console.warn(`Database query failed (attempt ${i + 1}/${retries}):`, error.message || error);
      
      const isConnectionError = 
        error.message?.includes("10054") || 
        error.message?.includes("closed") || 
        error.message?.includes("connection") ||
        error.message?.includes("I/O error") ||
        error.message?.includes("broken pipe");
        
      if (isConnectionError && i < retries - 1) {
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
        return await retryQuery(() => 
            db.user.findUnique({
                where: {id},    
                include: {
                    accounts: true
                }
            })
        );
    } catch (error) {
        console.error("Error fetching user by ID:", error);
        return null;
    }
}

export const getAccountByUserId = async (userId: string) => {
    try {
        return await retryQuery(() =>
            db.account.findFirst({
              where: {userId},  
            })
        );
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

        const userAccounts = await db.account.findMany({
            where: { userId: user.id }
        });

        const accountToDisconnect = userAccounts.find(acc => acc.provider === providerName);
        if (!accountToDisconnect) {
            return { error: `Profile ${providerName} is not connected` };
        }

        if (userAccounts.length <= 1) {
            return { error: "Cannot disconnect the only connected profile. At least one profile (Google or GitHub) must be linked to your account." };
        }

        await db.account.delete({
            where: { id: accountToDisconnect.id }
        });

        return { success: true };
    } catch (error) {
        console.error("Error disconnecting provider:", error);
        return { error: "Failed to disconnect profile" };
    }
}
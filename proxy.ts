import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { 
    DEFAULT_LOGIN_REDIRECT, apiAuthPrefix, publicRoutes, authRoutes
} from "@/routes";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig)

// next-auth v5's auth() with a callback returns a middleware-compatible function.
// In Next.js 16, the file convention is `proxy` with a named export.
// We wrap auth() to bridge the two conventions.
const authMiddleware = auth((req) => {
    const { nextUrl } = req
    const isLoggedIn = !!req.auth
    const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix)
    const isPublicRoute = publicRoutes.includes(nextUrl.pathname)
    const isAuthRoute = authRoutes.includes(nextUrl.pathname)

    if (isApiAuthRoute) {
        return undefined;
    }

    if (isAuthRoute) {
        if (isLoggedIn) {
            return Response.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
        }
        return undefined;
    }

    if (!isLoggedIn && !isPublicRoute) {
        if (nextUrl.pathname.startsWith("/api/")) {
            return Response.json({ message: "Unauthorized" }, { status: 401 })
        }
        let callbackUrl = nextUrl.pathname;
        if (nextUrl.search) {
            callbackUrl += nextUrl.search;
        }
        const encodedCallbackUrl = encodeURIComponent(callbackUrl);
        return Response.redirect(new URL(`/auth/sign-in?callbackUrl=${encodedCallbackUrl}`, nextUrl));
    }

    return undefined;
})

// Next.js 16 requires a named `proxy` export instead of a default export
export async function proxy(request: NextRequest, event: any) {
    return authMiddleware(request, event);
}

export const config = {
    matcher: ["/((?!.+\\.[\\w]+$|_next).*)"],
}

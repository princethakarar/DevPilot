import NextAuth from "next-auth";
import { 
    DEFAULT_LOGIN_REDIRECT, apiAuthPrefix, publicRoutes, authRoutes
} from "@/routes";
import authConfig from "./auth.config";

const {auth} = NextAuth(authConfig)

export default auth((req) => {
    const {nextUrl} = req
    const isLoggedIn = !!req.auth
    const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix)
    const isPublicRoute = publicRoutes.includes(nextUrl.pathname)
    const isAuthRoute = authRoutes.includes(nextUrl.pathname)

    if (isApiAuthRoute) {
        return null;
    }

<<<<<<< HEAD
    if(!isLoggedIn && !isPublicRoute && !isAuthRoute){
        if (nextUrl.pathname.startsWith("/api/")) {
            return Response.json({ message: "Unauthorized" }, { status: 401 })
        }
        const callbackUrl = nextUrl.pathname + nextUrl.search;
        return Response.redirect(new URL(`/auth/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`, nextUrl))
=======
    if (isAuthRoute) {
        if (isLoggedIn) {
            return Response.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
        }
        return null;
>>>>>>> 260d150 (web container running slow)
    }

    if (!isLoggedIn && !isPublicRoute) {
        let callbackUrl = nextUrl.pathname;
        if (nextUrl.search) {
            callbackUrl += nextUrl.search;
        }
        const encodedCallbackUrl = encodeURIComponent(callbackUrl);
        return Response.redirect(new URL(`/auth/sign-in?callbackUrl=${encodedCallbackUrl}`, nextUrl));
    }

    return null;
})

export const config = {
    matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
}

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

    if(isApiAuthRoute){
        return null
    }

    if(!isLoggedIn && !isPublicRoute && !isAuthRoute){
        return Response.redirect(new URL("/auth/sign-in", nextUrl))
    }

    return null
})

export const config = {
    matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
}

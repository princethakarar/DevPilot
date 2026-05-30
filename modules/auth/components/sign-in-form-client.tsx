"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
// icons removed — replace with emoji to avoid lucide-react export mismatch
import { signIn } from "next-auth/react";

function handleGoogleSignIn(e: React.MouseEvent){
  e.preventDefault();
  signIn("google", { callbackUrl: "/" });
}

function handleGithubSignIn(e: React.MouseEvent){
  e.preventDefault();
  signIn("github", { callbackUrl: "/" });
}

const SignInFormClient = () => {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">
          Sign In
        </CardTitle>
        <CardDescription className="text-center">
          Choose your preferred sign-in method
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        <div>
          <Button onClick={handleGoogleSignIn} variant={"outline"} className="w-full">
            <span className="mr-2">🟢</span>
            <span>Sign in with google</span>
          </Button>
        </div>
        <div>
          <Button onClick={handleGithubSignIn} variant={"outline"} className="w-full">
            <span className="mr-2">🐱</span>
            <span>Sign in with github</span>
          </Button>
        </div>
      </CardContent>

      <CardFooter>
        <p className="text-sm text-center text-gray-500 dark:text-gray-400 w-full">
          By signing in, you agree to our{" "}
          <a href="#" className="underline hover:text-primary">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="underline hover:text-primary">
            Privacy Policy
          </a>
          .
        </p>
      </CardFooter>
    </Card>
  );
};

export default SignInFormClient;



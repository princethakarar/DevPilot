import React from "react";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <SessionProvider session={session}>
      <main className="dark bg-zinc-950 text-foreground min-h-screen w-full flex items-center justify-center p-4">
        {children}
      </main>
    </SessionProvider>
  );
}


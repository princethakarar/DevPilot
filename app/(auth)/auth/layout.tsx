import React from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="dark bg-zinc-950 text-foreground min-h-screen w-full flex items-center justify-center p-4">
      {children}
    </main>
  );
}


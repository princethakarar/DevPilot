import { SidebarProvider } from "@/components/ui/sidebar";
import React from "react";

export default function PlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark h-full w-full bg-background text-foreground flex flex-col">
      <SidebarProvider>
        {children}
      </SidebarProvider>
    </div>
  );
}

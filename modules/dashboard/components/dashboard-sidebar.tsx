"use client"

import { useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Code2,
  Compass,
  FolderPlus,
  History,
  Home,
  LayoutDashboard,
  Lightbulb,
  type LucideIcon,
  Plus,
  Settings,
  Star,
  Terminal,
  Zap,
  Database,
  FlameIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import Image from "next/image"

// Define the interface for a single playground item, icon is now a string
interface PlaygroundData {
  id: string
  name: string
  icon: string // Changed to string
  starred: boolean
}

// Map icon names (strings) to their corresponding LucideIcon components
const lucideIconMap: Record<string, LucideIcon> = {
  Zap: Zap,
  Lightbulb: Lightbulb,
  Database: Database,
  Compass: Compass,
  FlameIcon: FlameIcon,
  Terminal: Terminal,
  Code2: Code2, // Include the default icon
  // Add any other icons you might use dynamically
}

export function DashboardSidebar({ initialPlaygroundData }: { initialPlaygroundData: PlaygroundData[] }) {
  const pathname = usePathname()
  const starredPlaygrounds = useMemo(() => initialPlaygroundData.filter((p) => p.starred), [initialPlaygroundData])
  const recentPlaygrounds = useMemo(() => initialPlaygroundData, [initialPlaygroundData])

  return (
    <Sidebar variant="inset" collapsible="icon" className="border-r border-[rgba(0,212,255,0.08)] bg-[#020B1F] shadow-[5px_0_25px_rgba(0,0,0,0.3)]">
      <SidebarHeader className="border-b border-[rgba(0,212,255,0.08)] bg-[rgba(7,20,40,0.4)] backdrop-blur-md">
        <div className="flex items-center gap-2 px-4 py-3 justify-center">
          <Image src={"/logo.svg"} alt="logo" height={60} width={60} />
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-transparent py-4 px-3">
        <SidebarGroup>
          <SidebarMenu className="space-y-1.5">
            <SidebarMenuItem>
              <SidebarMenuButton 
                asChild 
                isActive={pathname === "/"} 
                tooltip="Home"
                className={cn(
                  "w-full flex items-center px-3 py-2 text-sm rounded-xl transition-all duration-300 cursor-pointer font-jetbrains border border-transparent text-[#7ca8cc] hover:text-white hover:bg-[#00D4FF]/5 hover:shadow-[inset_0_0_8px_rgba(0,212,255,0.05)]",
                  pathname === "/" && "bg-gradient-to-r from-[rgba(0,212,255,0.12)] to-[rgba(139,92,246,0.12)] text-[#00D4FF] border-[rgba(0,212,255,0.25)] shadow-[0_0_15px_rgba(0,212,255,0.08)]"
                )}
              >
                <Link href="/">
                  <Home className="h-4 w-4 shrink-0 text-[#00D4FF]" />
                  <span>Home</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton 
                asChild 
                isActive={pathname === "/dashboard"} 
                tooltip="Dashboard"
                className={cn(
                  "w-full flex items-center px-3 py-2 text-sm rounded-xl transition-all duration-300 cursor-pointer font-jetbrains border border-transparent text-[#7ca8cc] hover:text-white hover:bg-[#8B5CF6]/5 hover:shadow-[inset_0_0_8px_rgba(139,92,246,0.05)]",
                  pathname === "/dashboard" && "bg-gradient-to-r from-[rgba(0,212,255,0.12)] to-[rgba(139,92,246,0.12)] text-[#00D4FF] border-[rgba(0,212,255,0.25)] shadow-[0_0_15px_rgba(0,212,255,0.08)]"
                )}
              >
                <Link href="/dashboard">
                  <LayoutDashboard className="h-4 w-4 shrink-0 text-[#8B5CF6]" />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-xs font-semibold font-jetbrains uppercase tracking-widest text-[#3a6080] px-3">
            <Star className="h-3.5 w-3.5 mr-2 text-amber-400" />
            Starred
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-1.5">
            <SidebarMenu className="space-y-1.5">
              {starredPlaygrounds.length === 0 && recentPlaygrounds.length === 0 ? (
                <div className="text-center text-xs font-jetbrains text-[#3a6080] py-4 w-full">Create your playground</div>
              ) : (
                starredPlaygrounds.map((playground) => {
                  const IconComponent = lucideIconMap[playground.icon] || Code2;
                  const isActive = pathname === `/playground/${playground.id}`;
                  return (
                    <SidebarMenuItem key={playground.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={playground.name}
                        className={cn(
                          "w-full flex items-center px-3 py-2 text-sm rounded-xl transition-all duration-300 cursor-pointer font-jetbrains border border-transparent text-[#7ca8cc] hover:text-white hover:bg-[#00D4FF]/5 hover:shadow-[inset_0_0_8px_rgba(0,212,255,0.05)]",
                          isActive && "bg-gradient-to-r from-[rgba(0,212,255,0.12)] to-[rgba(139,92,246,0.12)] text-[#00D4FF] border-[rgba(0,212,255,0.25)] shadow-[0_0_15px_rgba(0,212,255,0.08)]"
                        )}
                      >
                        <Link href={`/playground/${playground.id}`}>
                          {IconComponent && <IconComponent className="h-4 w-4 shrink-0" />}
                          <span>{playground.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-xs font-semibold font-jetbrains uppercase tracking-widest text-[#3a6080] px-3">
            <History className="h-3.5 w-3.5 mr-2 text-[#00D4FF]" />
            Recent
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-1.5">
            <SidebarMenu className="space-y-1.5">
              {starredPlaygrounds.length === 0 && recentPlaygrounds.length === 0 ? null : (
                recentPlaygrounds.map((playground) => {
                  const IconComponent = lucideIconMap[playground.icon] || Code2;
                  const isActive = pathname === `/playground/${playground.id}`;
                  return (
                    <SidebarMenuItem key={playground.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={playground.name}
                        className={cn(
                          "w-full flex items-center px-3 py-2 text-sm rounded-xl transition-all duration-300 cursor-pointer font-jetbrains border border-transparent text-[#7ca8cc] hover:text-white hover:bg-[#00D4FF]/5 hover:shadow-[inset_0_0_8px_rgba(0,212,255,0.05)]",
                          isActive && "bg-gradient-to-r from-[rgba(0,212,255,0.12)] to-[rgba(139,92,246,0.12)] text-[#00D4FF] border-[rgba(0,212,255,0.25)] shadow-[0_0_15px_rgba(0,212,255,0.08)]"
                        )}
                      >
                        <Link href={`/playground/${playground.id}`}>
                          {IconComponent && <IconComponent className="h-4 w-4 shrink-0" />}
                          <span>{playground.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              )}
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  tooltip="View all"
                  className="w-full flex items-center px-3 py-2 text-sm rounded-xl transition-all duration-300 cursor-pointer font-jetbrains border border-transparent text-[#3a6080] hover:text-[#00D4FF] hover:bg-[#00D4FF]/5"
                >
                  <Link href="/playgrounds">
                    <span>View all playgrounds</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-[rgba(0,212,255,0.08)] bg-[rgba(7,20,40,0.4)] px-3 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              tooltip="Settings"
              className="w-full flex items-center px-3 py-2 text-sm rounded-xl transition-all duration-300 cursor-pointer font-jetbrains border border-transparent text-[#7ca8cc] hover:text-white hover:bg-[#00D4FF]/5"
            >
              <Link href="/settings">
                <Settings className="h-4 w-4 shrink-0 text-[#7ca8cc]" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";
import type { Project } from "../types";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Edit3, Trash2, ExternalLink, Copy, Download, Eye, Plus, ArrowRight, GitBranch, Zap, FolderOpen, Rocket, LogOut, Mail, Calendar, Hash, Check, Sparkles, ShieldAlert, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TemplateSelectingModal from "./template-selecting-modal";
import OpenRepoDialog from "./dialogs/open-repo-dialog";
import { MarkedToggleButton } from "./marked-toggle";
import { createPlayground } from "../actions";
import LogoutButton from "@/modules/auth/components/logout-button";
import HeroCanvas from "@/modules/home/landing/hero-canvas";
import { signIn } from "next-auth/react";
import { disconnectProvider } from "@/modules/auth/actions";
import type { Templates } from "@/lib/db/schemas";

const SHOW_NEW_PROJECT = true;

interface DashboardContentProps {
  user: { 
    id?: string;
    name?: string | null; 
    email?: string | null; 
    image?: string | null;
    role?: string;
    createdAt?: string | Date;
    accounts?: { provider: string }[];
  } | null;
  projects: Project[];
  onDeleteProject: (id: string) => Promise<void>;
  onUpdateProject: (id: string, data: { title: string; description: string }) => Promise<void>;
  onDuplicateProject: (id: string) => Promise<any>;
}



export default function DashboardContent({ user, projects, onDeleteProject, onUpdateProject, onDuplicateProject }: DashboardContentProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRepoDialogOpen, setIsRepoDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [editData, setEditData] = useState({ title: "", description: "" });
  const [isLoading, setIsLoading] = useState(false);

  const firstName = user?.name?.split(" ")[0] || "developer";
  const isGoogleConnected = user?.accounts?.some(acc => acc.provider === "google") ?? false;
  const isGithubConnected = user?.accounts?.some(acc => acc.provider === "github") ?? false;

  const handleDisconnect = async (provider: string) => {
    try {
      const result = await disconnectProvider(provider);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} profile disconnected successfully!`);
        router.refresh();
      }
    } catch (err) {
      toast.error("Failed to disconnect profile");
    }
  };

  const formattedDate = useMemo(() => {
    if (!user?.createdAt) return null;
    try {
      const date = new Date(user.createdAt);
      return new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(date);
    } catch (e) {
      return null;
    }
  }, [user?.createdAt]);



  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-400 border border-rose-500/20 shadow-xs font-sans">
            <ShieldAlert className="h-3 w-3" />
            Admin
          </span>
        );
      case "PREMIUM_USER":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/20 shadow-xs font-sans">
            <Sparkles className="h-3 w-3" />
            Pro
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#3a6080]/15 px-2 py-0.5 text-xs font-semibold text-[#7ca8cc] border border-[rgba(0,180,255,0.15)] shadow-xs font-sans">
            <User className="h-3 w-3" />
            Standard
          </span>
        );
    }
  };

  const handleCreateProject = async (data: { title: string; template: Templates; description?: string }) => {
    const res = await createPlayground(data);
    if (res?.error) {
      toast.error(res.error);
      return false;
    }
    toast.success("Playground Created successfully");
    setIsModalOpen(false);
    router.push(`/playground/${res.playground?.id}`);
    return true;
  };

  const handleEditClick = (project: Project) => { setSelectedProject(project); setEditData({ title: project.title, description: project.description || "" }); setEditDialogOpen(true); };
  const handleDeleteClick = (project: Project) => { setSelectedProject(project); setDeleteDialogOpen(true); };

  const handleUpdateProject = async () => {
    if (!selectedProject) return;
    setIsLoading(true);
    try { await onUpdateProject(selectedProject.id, editData); setEditDialogOpen(false); toast.success("Project updated successfully"); }
    catch { toast.error("Failed to update project"); }
    finally { setIsLoading(false); }
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    setIsLoading(true);
    try { await onDeleteProject(selectedProject.id); setDeleteDialogOpen(false); setSelectedProject(null); toast.success("Project deleted successfully"); }
    catch { toast.error("Failed to delete project"); }
    finally { setIsLoading(false); }
  };

  const handleDuplicateProject = async (project: Project) => {
    setIsLoading(true);
    try { await onDuplicateProject(project.id); toast.success("Project duplicated successfully"); }
    catch { toast.error("Failed to duplicate project"); }
    finally { setIsLoading(false); }
  };

  const copyProjectUrl = (projectId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/playground/${projectId}`);
    toast.success("Project URL copied to clipboard");
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#050d1a]">
      {/* ─── BACKGROUND CANVAS ─── */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-45">
        <HeroCanvas />
      </div>

      {/* ─── FLOATING ITEMS ─── */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none">
        <div className="font-jetbrains absolute top-[18%] left-[6%] text-[11px] text-[rgba(0,180,255,0.18)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_8s_ease-in-out_infinite]">const ai = new DevPilot();</div>
        <div className="font-jetbrains absolute top-[30%] right-[8%] text-[11px] text-[rgba(0,180,255,0.18)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_10s_2s_ease-in-out_infinite]">0101 1100 0011</div>
        <div className="font-jetbrains absolute top-[65%] left-[4%] text-[11px] text-[rgba(0,180,255,0.18)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_9s_1s_ease-in-out_infinite]">&lt;/&gt; &lt;&gt; {"{}"}</div>
        <div className="font-jetbrains absolute top-[72%] right-[6%] text-[11px] text-[rgba(0,180,255,0.18)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_11s_3s_ease-in-out_infinite]">await suggest(context)</div>
        <div className="font-jetbrains absolute top-[85%] left-[8%] text-[11px] text-[rgba(166,123,212,0.18)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_12s_ease-in-out_infinite]">import {"{ IDE }"} from "devpilot"</div>
      </div>

      <div className="relative z-10 w-full min-h-screen flex flex-col">
        {/* ─── NAVBAR ─── */}
        <nav className="flex items-center justify-between px-4 sm:px-6 lg:px-10 h-16 border-b border-[rgba(0,180,255,0.08)] bg-[rgba(5,13,26,0.7)] backdrop-blur-[20px]">
        <Link href="/" className="flex items-center gap-2 sm:gap-2.5 no-underline font-montserrat shrink-0">
          <Image src="/icon-bg-removed.png" alt="DevPilot" width={40} height={40}  className="object-contain drop-shadow-[0_0_8px_rgba(0,207,255,0.3)] w-8 h-8 sm:w-10 sm:h-10" />
          <div className="flex flex-col leading-none">
            <div className="flex items-baseline">
              <span className="text-xl sm:text-[25px] text-white tracking-tight" style={{ fontWeight: 600 }}>Dev</span>
              <span className="text-xl sm:text-[25px] tracking-tight" style={{ fontWeight: 700, background: "linear-gradient(to right, #00CFFF, #3B82F6, #A855F7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Pilot</span>
            </div>
            <span className="text-[8px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.25em] uppercase mt-0.5" style={{ color: "#94A3B8", fontWeight: 400 }}>AI POWERED IDE</span>
          </div>
        </Link>
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger className="outline-none focus:outline-none">
              <div className="relative group cursor-pointer hover:scale-105 active:scale-95 transition-all duration-300">
                <div className="absolute -inset-[3px] rounded-full bg-gradient-to-r from-[#00CFFF] via-[#3B82F6] to-[#A855F7] opacity-60 group-hover:opacity-100 blur-[4px] transition-opacity duration-300" />
                {user?.image ? (
                  <Image src={user.image} alt="avatar" width={40} height={40} className="relative w-11 h-11 rounded-full border-2 border-[#050d1a] object-cover" />
                ) : (
                  <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-[#1a5faa] via-[#3B82F6] to-[#A855F7] flex items-center justify-center text-white font-bold text-sm border-2 border-[#050d1a]">
                    {firstName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end" 
              className="w-80 mt-3 p-0 bg-[#071428] border border-[rgba(0,180,255,0.25)] shadow-[0_10px_40px_rgba(0,0,0,0.5)] text-[#e8f4ff] rounded-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200"
            >
              {/* User Card Header */}
              <div className="relative p-6 pb-4 bg-gradient-to-b from-[rgba(0,180,255,0.08)] to-transparent border-b border-[rgba(0,180,255,0.1)]">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="relative group">
                    <div className="absolute -inset-[3px] rounded-full bg-gradient-to-r from-[#00CFFF] via-[#3B82F6] to-[#A855F7] opacity-60 blur-[3px]" />
                    {user?.image ? (
                      <Image src={user.image} alt="avatar" width={64} height={64} className="relative w-16 h-16 rounded-full border-2 border-[#050d1a] object-cover shadow-md" />
                    ) : (
                      <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-[#1a5faa] via-[#3B82F6] to-[#A855F7] flex items-center justify-center text-white font-bold text-xl border-2 border-[#050d1a]">
                        {firstName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-white text-base leading-tight">
                      {user?.name || "DevPilot Developer"}
                    </h4>
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      {getRoleBadge(user?.role || "USER")}
                    </div>
                  </div>
                </div>
              </div>

              {/* User Details Grid */}
              <div className="p-4 space-y-3 text-[#7ca8cc]">
                {user?.email && (
                  <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-[rgba(0,180,255,0.04)] transition-colors">
                    <Mail className="h-4 w-4 text-[#00b4ff] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-[#3a6080] font-jetbrains">Email Address</p>
                      <p className="text-xs font-medium truncate text-[#e8f4ff] font-jetbrains">{user.email}</p>
                    </div>
                  </div>
                )}



                {formattedDate && (
                  <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-[rgba(0,180,255,0.04)] transition-colors">
                    <Calendar className="h-4 w-4 text-[#00b4ff] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-[#3a6080] font-jetbrains">Joined On</p>
                      <p className="text-xs font-medium text-[#e8f4ff] font-jetbrains">{formattedDate}</p>
                    </div>
                  </div>
                )}

                {/* Connected Profiles */}
                <div className="border-t border-[rgba(0,180,255,0.08)] pt-3 mt-3 px-2 space-y-2.5">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-[#3a6080] font-jetbrains">Connected Profiles</p>
                  
                  {/* Google */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                      </svg>
                      <span className="text-[#e8f4ff] font-jetbrains text-xs">Google</span>
                    </div>
                    {isGoogleConnected ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#4ec96b] font-jetbrains bg-[#4ec96b]/10 border border-[#4ec96b]/20 px-1.5 py-0.5 rounded">Connected</span>
                        <button
                          onClick={() => handleDisconnect("google")}
                          className="text-[#ff5f57] hover:text-[#ff3b30] p-1.5 rounded hover:bg-[rgba(255,95,87,0.1)] transition-colors cursor-pointer"
                          title="Disconnect Google Profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => signIn("google", { callbackUrl: "/dashboard" })} className="text-[10px] text-[#00b4ff] hover:text-[#00cfff] font-jetbrains bg-[#00b4ff]/10 border border-[#00b4ff]/20 hover:bg-[#00b4ff]/20 px-1.5 py-0.5 rounded transition-all cursor-pointer">Connect</button>
                    )}
                  </div>

                  {/* GitHub */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                      <span className="text-[#e8f4ff] font-jetbrains text-xs">GitHub</span>
                    </div>
                    {isGithubConnected ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#4ec96b] font-jetbrains bg-[#4ec96b]/10 border border-[#4ec96b]/20 px-1.5 py-0.5 rounded">Connected</span>
                        <button
                          onClick={() => handleDisconnect("github")}
                          className="text-[#ff5f57] hover:text-[#ff3b30] p-1.5 rounded hover:bg-[rgba(255,95,87,0.1)] transition-colors cursor-pointer"
                          title="Disconnect GitHub Profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => signIn("github", { callbackUrl: "/dashboard" })} className="text-[10px] text-[#a67bd4] hover:text-[#b18de0] font-jetbrains bg-[#a67bd4]/10 border border-[#a67bd4]/20 hover:bg-[#a67bd4]/20 px-1.5 py-0.5 rounded transition-all cursor-pointer">Sync Profile</button>
                    )}
                  </div>
                </div>
              </div>

              <DropdownMenuSeparator className="bg-[rgba(0,180,255,0.08)]" />

              {/* Action Button */}
              <div className="p-2">
                <LogoutButton>
                  <DropdownMenuItem className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-[#ff5f57] hover:bg-[rgba(255,95,87,0.08)] cursor-pointer transition-colors focus:bg-[rgba(255,95,87,0.08)] focus:text-[#ff5f57] focus:outline-none font-jetbrains">
                    <LogOut className="h-4 w-4 shrink-0" />
                    Logout
                  </DropdownMenuItem>
                </LogoutButton>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      {/* ─── MAIN CONTENT ─── */}
      <div className="w-full flex justify-center">
      <div className="w-full max-w-[1320px] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">



        {/* ─── ACTION CARDS ─── */}
        <div className={`mb-8 ${SHOW_NEW_PROJECT ? "grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5" : ""}`}>
          {/* New Project (hidden — see SHOW_NEW_PROJECT) */}
          {SHOW_NEW_PROJECT && (
            <div
              onClick={() => setIsModalOpen(true)}
              className="group flex items-center justify-between px-4 sm:px-7 py-4 sm:py-6 rounded-xl border border-[rgba(0,180,255,0.12)] bg-gradient-to-br from-[rgba(10,31,61,0.7)] to-[rgba(7,20,40,0.9)] cursor-pointer hover:border-[rgba(0,180,255,0.35)] hover:-translate-y-0.5 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,180,255,0.1)]"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-xl bg-[rgba(0,180,255,0.1)] border border-[rgba(0,180,255,0.2)] flex items-center justify-center group-hover:shadow-[0_0_20px_rgba(0,180,255,0.2)] transition-shadow">
                  <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-[#00b4ff]" />
                </div>
                <div>
                  <h3 className="text-[14px] sm:text-[16px] font-bold text-white mb-0.5">New Project</h3>
                  <p className="font-jetbrains text-[10px] sm:text-[12px] text-[#7ca8cc]">Start building instantly with<br className="hidden sm:block"/>AI-powered development.</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-[#3a6080] group-hover:text-[#00b4ff] group-hover:translate-x-1 transition-all shrink-0" />
            </div>
          )}

          {/* Import GitHub */}
          <div
            onClick={() => setIsRepoDialogOpen(true)}
            className={`group flex items-center justify-between px-4 sm:px-7 py-4 sm:py-6 rounded-xl border border-[rgba(0,180,255,0.12)] bg-gradient-to-br from-[rgba(10,31,61,0.7)] to-[rgba(7,20,40,0.9)] cursor-pointer hover:border-[rgba(0,180,255,0.35)] hover:-translate-y-0.5 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,180,255,0.1)] ${SHOW_NEW_PROJECT ? "" : "max-w-xl mx-auto"}`}
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-xl bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.2)] flex items-center justify-center group-hover:shadow-[0_0_20px_rgba(168,85,247,0.2)] transition-shadow">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#a67bd4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                </svg>
              </div>
              <div>
                <h3 className="text-[14px] sm:text-[16px] font-bold text-white mb-0.5">Import GitHub Repository</h3>
                <p className="font-jetbrains text-[10px] sm:text-[12px] text-[#7ca8cc]">Clone and start coding from<br className="hidden sm:block"/>GitHub in seconds.</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-[#3a6080] group-hover:text-[#a67bd4] group-hover:translate-x-1 transition-all shrink-0" />
          </div>
        </div>

        {/* ─── STARRED PROJECTS ─── */}
        {(() => {
          const starred = projects.filter(p => p.Starmark?.[0]?.isMarked);
          if (starred.length === 0) return null;
          return (
            <div className="rounded-xl border border-[rgba(0,180,255,0.1)] bg-[rgba(7,17,31,0.5)] overflow-hidden mb-10">
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[rgba(0,180,255,0.08)] bg-[rgba(5,13,26,0.2)]">
                <h2 className="text-base sm:text-[16px] font-bold text-white flex items-center gap-2">
                  <span className="text-[#00CFFF]">★</span> Starred Projects
                </h2>
              </div>
              <div className="w-full">
                <table className="block md:table md:table-fixed w-full">
                  <thead className="hidden md:table-header-group">
                    <tr className="border-b border-[rgba(0,180,255,0.06)]">
                      {[
                        { label: "Project", width: "md:w-[42%]" },
                        { label: "Updated", width: "md:w-[16%]" },
                        { label: "Owner", width: "md:w-[22%]" },
                        { label: "Actions", width: "md:w-[20%]" },
                      ].map(({ label, width }) => (
                        <th key={label} className={`font-jetbrains text-[11px] text-[#3a6080] uppercase tracking-wider text-left px-6 py-3 font-medium ${width}`}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="block md:table-row-group">
                    {starred.map((project) => (
                      <tr key={project.id} className="group relative flex flex-col md:table-row border-b border-[rgba(0,180,255,0.04)] hover:bg-[rgba(0,180,255,0.03)] transition-colors p-4 md:p-0 cursor-pointer">
                        <td className="block md:table-cell px-0 py-2 md:px-6 md:py-4">
                          <Link href={`/playground/${project.id}`} className="absolute inset-0 z-0 rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00b4ff]" aria-label={`Open project ${project.title}`} />
                          <div className="min-w-0 flex-1">
                            <span className="text-[14px] font-semibold text-white group-hover:text-[#00b4ff] transition-colors truncate block">{project.title}</span>
                            {project.description && <p className="font-jetbrains text-[11px] text-[#3a6080] line-clamp-1 max-w-[250px] md:max-w-none">{project.description}</p>}
                          </div>
                        </td>
                        <td className="flex md:table-cell items-center gap-2 px-0 py-1 md:px-6 md:py-4 font-jetbrains text-[12px] text-[#7ca8cc]">
                          <span className="font-jetbrains text-[10px] uppercase text-[#3a6080] md:hidden w-[70px] shrink-0">Updated:</span>
                          {format(new Date(project.createdAt), "MMM dd, yyyy")}
                        </td>
                        <td className="hidden md:table-cell px-6 py-4">
                          <div className="flex items-center gap-2">
                            {project.user.image ? (
                              <Image src={project.user.image} alt={project.user.name || "User"} width={24} height={24} className="w-6 h-6 rounded-full border border-[rgba(0,180,255,0.15)]" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-[#1a5faa] flex items-center justify-center text-white text-[10px] font-bold">{(project.user.name || "U").charAt(0)}</div>
                            )}
                            <span className="font-jetbrains text-[12px] text-[#7ca8cc]">{project.user.name}</span>
                          </div>
                        </td>
                        <td className="flex md:table-cell items-center px-0 pt-3 pb-1 md:px-6 md:py-4 mt-2 md:mt-0 border-t border-[rgba(0,180,255,0.04)] md:border-0">
                          <div className="relative z-10 flex items-center gap-2 w-full justify-end md:justify-start">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-2 rounded-md hover:bg-[rgba(0,180,255,0.08)] transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"><MoreHorizontal className="w-5 h-5 text-[#3a6080]" /></button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 bg-[#0a1f3d] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] font-jetbrains p-1">
                                <DropdownMenuItem asChild><MarkedToggleButton markedForRevision={project.Starmark[0]?.isMarked} id={project.id} /></DropdownMenuItem>
                                <DropdownMenuItem asChild className="font-jetbrains text-[12px] text-[#7ca8cc] hover:text-white cursor-pointer transition-colors px-3 py-2 focus:bg-[rgba(0,180,255,0.08)] focus:text-white focus:outline-none"><Link href={`/playground/${project.id}`} className="flex items-center"><Eye className="h-4 w-4 mr-2" />Open Project</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild className="font-jetbrains text-[12px] text-[#7ca8cc] hover:text-white cursor-pointer transition-colors px-3 py-2 focus:bg-[rgba(0,180,255,0.08)] focus:text-white focus:outline-none"><Link href={`/playground/${project.id}`} target="_blank" className="flex items-center"><ExternalLink className="h-4 w-4 mr-2" />Open in New Tab</Link></DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-[rgba(0,180,255,0.08)] my-1" />
                                <DropdownMenuItem onClick={() => handleEditClick(project)} className="font-jetbrains text-[12px] text-[#7ca8cc] hover:text-white cursor-pointer transition-colors px-3 py-2 focus:bg-[rgba(0,180,255,0.08)] focus:text-white focus:outline-none"><Edit3 className="h-4 w-4 mr-2" />Edit Project</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDuplicateProject(project)} className="font-jetbrains text-[12px] text-[#7ca8cc] hover:text-white cursor-pointer transition-colors px-3 py-2 focus:bg-[rgba(0,180,255,0.08)] focus:text-white focus:outline-none"><Copy className="h-4 w-4 mr-2" />Duplicate</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => copyProjectUrl(project.id)} className="font-jetbrains text-[12px] text-[#7ca8cc] hover:text-white cursor-pointer transition-colors px-3 py-2 focus:bg-[rgba(0,180,255,0.08)] focus:text-white focus:outline-none"><Download className="h-4 w-4 mr-2" />Copy URL</DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-[rgba(0,180,255,0.08)] my-1" />
                                <DropdownMenuItem onClick={() => handleDeleteClick(project)} className="font-jetbrains text-[12px] text-[#ff5f57] hover:text-[#ff5f57] focus:bg-[rgba(255,95,87,0.1)] focus:text-[#ff5f57] cursor-pointer transition-colors px-3 py-2 focus:outline-none"><Trash2 className="h-4 w-4 mr-2" />Delete Project</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* ─── RECENT PROJECTS ─── */}
        <div className="w-full rounded-xl border border-[rgba(0,180,255,0.1)] bg-[rgba(7,17,31,0.5)] overflow-hidden">
          <div className="flex items-center justify-between px-4 md:px-7 py-4 border-b border-[rgba(0,180,255,0.08)]">
            <h2 className="text-base sm:text-[16px] font-bold text-white">Recent Projects</h2>
          </div>

          {projects.length === 0 ? (
            <div className="w-full flex flex-col items-center justify-center py-16 px-4 text-center">
              <FolderOpen className="w-10 h-10 sm:w-12 sm:h-12 text-[#3a6080] mb-4" />
              <h3 className="text-[14px] sm:text-[16px] font-semibold text-[#7ca8cc] mb-1">No projects found</h3>
              <p className="font-jetbrains text-[11px] sm:text-[13px] text-[#3a6080]">Create a new project to get started!</p>
            </div>
          ) : (
            <div className="w-full">
              {/*
                CSS grid instead of an HTML table: a semantic <table> with
                table-layout:fixed sized its columns off header-cell percentage
                widths (42/16/22/20%), which meant PROJECT (the widest %) grew
                far past what short project names need, stranding UPDATED/OWNER/
                ACTIONS near the right edge with a dead gap in between. Fixed
                pixel tracks for the three secondary columns (sized to what their
                content actually needs) + a flexible first column removes that
                gap regardless of row content length.
              */}
              <div role="table" aria-label="Recent projects" className="w-full">
                <div role="rowgroup" className="hidden md:grid md:grid-cols-[minmax(0,1fr)_140px_220px_96px] border-b border-[rgba(0,180,255,0.06)]">
                  <div role="columnheader" className="font-jetbrains text-[11px] text-[#3a6080] uppercase tracking-wider text-left md:px-7 py-3 font-medium">Project</div>
                  <div role="columnheader" className="font-jetbrains text-[11px] text-[#3a6080] uppercase tracking-wider text-center px-4 py-3 font-medium">Updated</div>
                  <div role="columnheader" className="font-jetbrains text-[11px] text-[#3a6080] uppercase tracking-wider text-center px-4 py-3 font-medium">Owner</div>
                  <div role="columnheader" className="font-jetbrains text-[11px] text-[#3a6080] uppercase tracking-wider text-center px-4 py-3 font-medium">Actions</div>
                </div>
                <div role="rowgroup">
                  {projects.map((project) => (
                    <div role="row" key={project.id} className="group relative flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_140px_220px_96px] border-b border-[rgba(0,180,255,0.04)] hover:bg-[rgba(0,180,255,0.03)] transition-colors p-4 md:p-0 cursor-pointer">
                      <div role="cell" className="px-0 py-2 md:px-7 md:py-3">
                        <Link href={`/playground/${project.id}`} className="absolute inset-0 z-0 rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00b4ff]" aria-label={`Open project ${project.title}`} />
                        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                          <span className="text-[14px] font-semibold text-white group-hover:text-[#00b4ff] transition-colors truncate block">{project.title}</span>
                          {project.description && <p className="font-jetbrains text-[11px] text-[#3a6080] line-clamp-1 max-w-[250px] md:max-w-none">{project.description}</p>}
                        </div>
                      </div>
                      <div role="cell" className="flex items-center gap-2 px-0 py-1 md:justify-center md:px-4 md:py-3 font-jetbrains text-[12px] text-[#7ca8cc]">
                        <span className="font-jetbrains text-[10px] uppercase text-[#3a6080] md:hidden w-[70px] shrink-0">Updated:</span>
                        {format(new Date(project.createdAt), "MMM dd, yyyy")}
                      </div>
                      <div role="cell" className="hidden md:flex md:items-center md:justify-center md:px-4 md:py-3">
                        <div className="flex items-center gap-2">
                          {project.user.image ? (
                            <Image src={project.user.image} alt={project.user.name || "User"} width={24} height={24} className="w-6 h-6 rounded-full border border-[rgba(0,180,255,0.15)] shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-[#1a5faa] flex items-center justify-center text-white text-[10px] font-bold shrink-0">{(project.user.name || "U").charAt(0)}</div>
                          )}
                          <span className="font-jetbrains text-[12px] text-[#7ca8cc] truncate max-w-[130px]">{project.user.name}</span>
                        </div>
                      </div>
                      <div role="cell" className="flex items-center px-0 pt-3 pb-1 md:justify-center md:px-4 md:py-3 mt-2 md:mt-0 border-t border-[rgba(0,180,255,0.04)] md:border-0">
                        <div className="relative z-10 flex items-center gap-2 w-full justify-end md:justify-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-2 rounded-md hover:bg-[rgba(0,180,255,0.08)] transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"><MoreHorizontal className="w-5 h-5 text-[#3a6080]" /></button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-[#0a1f3d] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] font-jetbrains p-1">
                              <DropdownMenuItem asChild><MarkedToggleButton markedForRevision={project.Starmark[0]?.isMarked} id={project.id} /></DropdownMenuItem>
                              <DropdownMenuItem asChild className="font-jetbrains text-[12px] text-[#7ca8cc] hover:text-white cursor-pointer transition-colors px-3 py-2 focus:bg-[rgba(0,180,255,0.08)] focus:text-white focus:outline-none"><Link href={`/playground/${project.id}`} className="flex items-center"><Eye className="h-4 w-4 mr-2" />Open Project</Link></DropdownMenuItem>
                              <DropdownMenuItem asChild className="font-jetbrains text-[12px] text-[#7ca8cc] hover:text-white cursor-pointer transition-colors px-3 py-2 focus:bg-[rgba(0,180,255,0.08)] focus:text-white focus:outline-none"><Link href={`/playground/${project.id}`} target="_blank" className="flex items-center"><ExternalLink className="h-4 w-4 mr-2" />Open in New Tab</Link></DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-[rgba(0,180,255,0.08)] my-1" />
                              <DropdownMenuItem onClick={() => handleEditClick(project)} className="font-jetbrains text-[12px] text-[#7ca8cc] hover:text-white cursor-pointer transition-colors px-3 py-2 focus:bg-[rgba(0,180,255,0.08)] focus:text-white focus:outline-none"><Edit3 className="h-4 w-4 mr-2" />Edit Project</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicateProject(project)} className="font-jetbrains text-[12px] text-[#7ca8cc] hover:text-white cursor-pointer transition-colors px-3 py-2 focus:bg-[rgba(0,180,255,0.08)] focus:text-white focus:outline-none"><Copy className="h-4 w-4 mr-2" />Duplicate</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => copyProjectUrl(project.id)} className="font-jetbrains text-[12px] text-[#7ca8cc] hover:text-white cursor-pointer transition-colors px-3 py-2 focus:bg-[rgba(0,180,255,0.08)] focus:text-white focus:outline-none"><Download className="h-4 w-4 mr-2" />Copy URL</DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-[rgba(0,180,255,0.08)] my-1" />
                              <DropdownMenuItem onClick={() => handleDeleteClick(project)} className="font-jetbrains text-[12px] text-[#ff5f57] hover:text-[#ff5f57] focus:bg-[rgba(255,95,87,0.1)] focus:text-[#ff5f57] cursor-pointer transition-colors px-3 py-2 focus:outline-none"><Trash2 className="h-4 w-4 mr-2" />Delete Project</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {projects.length > 0 && (
                <div className="text-center py-3 font-jetbrains text-[11px] text-[#3a6080] border-t border-[rgba(0,180,255,0.06)]">
                  Showing {projects.length} of {projects.length} projects
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* ─── MODALS ─── */}
      <TemplateSelectingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleCreateProject} />
      <OpenRepoDialog isOpen={isRepoDialogOpen} onClose={() => setIsRepoDialogOpen(false)} />

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[#0a1f3d] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] font-sans">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white font-sans tracking-wide">Edit Project</DialogTitle>
            <DialogDescription className="text-[#7ca8cc] font-sans text-[13px]">Make changes to your project details here.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title" className="text-[#7ca8cc] font-sans text-[13px]">Project Title</Label>
              <Input id="title" value={editData.title} onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))} className="bg-[rgba(0,0,0,0.3)] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] font-jetbrains text-[13px] focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-[#00CFFF]" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description" className="text-[#7ca8cc] font-sans text-[13px]">Description</Label>
              <Textarea id="description" value={editData.description} onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))} rows={3} className="bg-[rgba(0,0,0,0.3)] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] font-jetbrains text-[13px] focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-[#00CFFF]" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isLoading} className="border border-[rgba(0,180,255,0.15)] bg-transparent text-[#7ca8cc] hover:bg-[rgba(0,180,255,0.08)] hover:text-white font-jetbrains text-[13px]">Cancel</Button>
            <Button onClick={handleUpdateProject} disabled={isLoading || !editData.title.trim()} className="bg-gradient-to-r from-[#1a5faa] to-[#00b4ff] hover:from-[#154e8c] hover:to-[#009cd9] text-white font-jetbrains text-[13px] shadow-[0_4px_15px_rgba(0,180,255,0.2)]">
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#0a1f3d] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-white font-sans tracking-wide">Delete Project</AlertDialogTitle>
            <AlertDialogDescription className="text-[#7ca8cc] font-sans text-[13px]">Are you sure you want to delete &quot;{selectedProject?.title}&quot;? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={isLoading} className="border border-[rgba(0,180,255,0.15)] bg-transparent text-[#7ca8cc] hover:bg-[rgba(0,180,255,0.08)] hover:text-white font-jetbrains text-[13px] mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} disabled={isLoading} className="bg-[#ff5f57] text-white hover:bg-[#e04e47] font-jetbrains text-[13px] border-none shadow-[0_4px_15px_rgba(255,95,87,0.2)]">{isLoading ? "Deleting..." : "Delete Project"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}

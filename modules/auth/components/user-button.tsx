"use client";
import React, { useState, useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { 
  LogOut, 
  User, 
  Mail, 
  Shield, 
  Calendar, 
  Copy, 
  Check, 
  Hash,
  Sparkles,
  ShieldAlert
} from "lucide-react";
import LogoutButton from "./logout-button";
import { useCurrentUser } from "../hooks/use-current-user";

const UserButton = () => {
  const user = useCurrentUser();


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
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400 border border-rose-500/20 shadow-xs">
            <ShieldAlert className="h-3 w-3" />
            Admin
          </span>
        );
      case "PREMIUM_USER":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shadow-xs">
            <Sparkles className="h-3 w-3" />
            Pro
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 border border-zinc-500/20 shadow-xs">
            <User className="h-3 w-3" />
            Standard
          </span>
        );
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative rounded-full focus:outline-hidden hover:scale-105 active:scale-95 transition-transform duration-200 cursor-pointer">
          <Avatar className="h-9 w-9 border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs">
            <AvatarImage src={user?.image || ""} alt={user?.name || "User avatar"} />
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-medium text-sm">
              {user?.name ? user.name[0].toUpperCase() : <User className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent 
        className="w-80 p-0 rounded-2xl overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50 shadow-2xl bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md mr-4 animate-in fade-in-50 zoom-in-95 duration-200"
        align="end"
      >
        {/* User Card Header */}
        <div className="relative p-6 pb-4 bg-gradient-to-b from-indigo-50/50 to-transparent dark:from-indigo-950/20 border-b border-zinc-100 dark:border-zinc-900/50">
          <div className="flex flex-col items-center text-center space-y-3">
            <Avatar className="h-16 w-16 ring-4 ring-indigo-500/20 dark:ring-indigo-400/15 border border-zinc-200 dark:border-zinc-800 shadow-md">
              <AvatarImage src={user?.image || ""} alt={user?.name || "User avatar"} />
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-lg">
                {user?.name ? user.name[0].toUpperCase() : <User className="h-6 w-6" />}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h4 className="font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
                {user?.name || "DevPilot Developer"}
              </h4>
              <div className="flex items-center justify-center gap-1.5">
                {getRoleBadge(user?.role || "USER")}
              </div>
            </div>
          </div>
        </div>

        {/* User Details Grid */}
        <div className="p-4 space-y-3 text-zinc-600 dark:text-zinc-300">
          {user?.email && (
            <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
              <Mail className="h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 dark:text-zinc-500">Email Address</p>
                <p className="text-xs font-medium truncate text-zinc-700 dark:text-zinc-200">{user.email}</p>
              </div>
            </div>
          )}



          {formattedDate && (
            <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
              <Calendar className="h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 dark:text-zinc-500">Joined On</p>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{formattedDate}</p>
              </div>
            </div>
          )}
        </div>

        <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-900/50" />

        {/* Action Button */}
        <div className="p-2">
          <LogoutButton>
            <DropdownMenuItem className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer transition-colors focus:bg-rose-50 focus:text-rose-600 dark:focus:bg-rose-950/20 dark:focus:text-rose-400">
              <LogOut className="h-4 w-4 shrink-0" />
              Sign Out
            </DropdownMenuItem>
          </LogoutButton>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserButton;

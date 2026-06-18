"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Bot, 
  Code, 
  FileText, 
  Import, 
  Loader2,
  Power,
  PowerOff,
  Braces,
  Variable
} from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";
interface ToggleAIProps {
  isEnabled: boolean;
  onToggle: (value: boolean) => void;
  
  suggestionLoading: boolean;
  loadingProgress?: number;
  activeFeature?: string;
  isChatOpen: boolean;
  onToggleChat: (value: boolean) => void;
}

const ToggleAI: React.FC<ToggleAIProps> = ({
  isEnabled,
  onToggle,

  suggestionLoading,
  loadingProgress = 0,
  activeFeature,
  isChatOpen,
  onToggleChat,
}) => {

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            size="sm" 
            style={{
              background: "linear-gradient(135deg, #1D6FA4, #7C3AED)",
              boxShadow: "0 0 12px rgba(56, 189, 248, 0.15)",
              color: "#E2EAF4"
            }}
            className={cn(
              "relative gap-2 h-8 px-3.5 text-xs font-semibold font-sans rounded-none transition-all duration-300 cursor-pointer border-none",
              suggestionLoading && "opacity-75"
            )}
            onClick={(e) => e.preventDefault()}
          >
            {suggestionLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E2EAF4]" />
            ) : (
              <Bot className="h-3.5 w-3.5 text-[#E2EAF4]" />
            )}
            <span>AI ENGINE</span>
            {isEnabled ? (
              <div className="w-2 h-2 bg-green-500 rounded-full animate-ping shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
            ) : (
              <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 bg-[#0D1221] border border-[#1E2D45] text-[#E2EAF4] rounded-lg shadow-2xl p-1 relative z-50">
          <DropdownMenuLabel className="flex items-center justify-between py-2.5 px-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-[#38BDF8]" />
              <span className="text-xs font-medium font-sans uppercase tracking-wider">AI Pilot Core</span>
            </div>
            <Badge 
              className={cn(
                "text-[10px] font-semibold font-sans",
                isEnabled 
                  ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              )}
            >
              {isEnabled ? "Online" : "Offline"}
            </Badge>
          </DropdownMenuLabel>
          
          {suggestionLoading && activeFeature && (
            <div className="px-3 pb-3 pt-1">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-sans text-[#6B8CAE]">
                  <span>{activeFeature}</span>
                  <span>{Math.round(loadingProgress)}%</span>
                </div>
                <Progress 
                  value={loadingProgress} 
                  className="h-1 bg-[#080C18]"
                />
              </div>
            </div>
          )}
          
          <DropdownMenuSeparator className="bg-[#1E2D45]" />
          
          <DropdownMenuItem 
            onClick={() => onToggle(!isEnabled)}
            className="py-2.5 px-3 rounded-md hover:bg-[#1A2236] cursor-pointer focus:bg-[#1A2236]"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                {isEnabled ? (
                  <Power className="h-4 w-4 text-rose-400" />
                ) : (
                  <Power className="h-4 w-4 text-green-400" />
                )}
                <div>
                  <div className="text-xs font-semibold font-sans uppercase text-[#E2EAF4]">
                    {isEnabled ? "Shutdown Core" : "Initialize Core"}
                  </div>
                  <div className="text-[10px] text-[#6B8CAE] font-sans">
                    Toggle real-time AI suggestions
                  </div>
                </div>
              </div>
              <div className={cn(
                "w-8 h-4 rounded-full border transition-all duration-200 relative",
                isEnabled 
                  ? "bg-green-500/20 border-green-500/40" 
                  : "bg-[#080C18] border-[#1E2D45]"
              )}>
                <div className={cn(
                  "w-3 h-3 rounded-full transition-all duration-200 absolute top-0.5",
                  isEnabled ? "left-4 bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" : "left-0.5 bg-[#3D5470]"
                )} />
              </div>
            </div>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator className="bg-[#1E2D45]" />
          
          <DropdownMenuItem 
            onClick={() => onToggleChat(!isChatOpen)}
            className="py-2.5 px-3 rounded-md hover:bg-[#1A2236] cursor-pointer focus:bg-[#1A2236]"
          >
            <div className="flex items-center gap-3 w-full">
              <Code className="h-4 w-4 text-[#A78BFA]" />
              <div>
                <div className="text-xs font-semibold font-sans uppercase text-[#E2EAF4]">
                  {isChatOpen ? "Close AI Terminal" : "Open AI Terminal"}
                </div>
                <div className="text-[10px] text-[#6B8CAE] font-sans">
                  Chat with your AI copilot
                </div>
              </div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export default ToggleAI;

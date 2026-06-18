"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  GitCommit,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  FilePlus2,
  FileEdit,
  FileWarning,
} from "lucide-react";
import {
  getPlaygroundChangesList,
  commitChangesToGithub,
} from "@/modules/playground/actions/commit";

const GithubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

interface CommitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  playgroundId: string;
  githubRepo: string;
  githubBranch: string;
}

export default function CommitDialog({
  isOpen,
  onClose,
  playgroundId,
  githubRepo,
  githubBranch,
}: CommitDialogProps) {
  const [commitMessage, setCommitMessage] = useState("");
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [changes, setChanges] = useState<{ path: string; status: "modified" | "added" | "deleted" }[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setCommitMessage("");
      setChanges([]);
      return;
    }

    const loadChanges = async () => {
      setLoadingChanges(true);
      const result = await getPlaygroundChangesList(playgroundId);
      if (result.error) {
        toast.error(result.error);
      } else {
        setChanges(result.changes || []);
      }
      setLoadingChanges(false);
    };

    loadChanges();
  }, [isOpen, playgroundId]);

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      toast.error("Please enter a commit message");
      return;
    }

    setCommitting(true);
    const result = await commitChangesToGithub(playgroundId, commitMessage);

    if (result.success) {
      toast.success("Changes pushed to GitHub successfully!");
      onClose();
    } else {
      toast.error(result.error || "Failed to commit and push changes");
    }
    setCommitting(false);
  };

  const getStatusIcon = (status: "modified" | "added" | "deleted") => {
    switch (status) {
      case "added":
        return <FilePlus2 className="w-3.5 h-3.5 text-[#4ec96b]" />;
      case "modified":
        return <FileEdit className="w-3.5 h-3.5 text-[#00b4ff]" />;
      case "deleted":
        return <FileWarning className="w-3.5 h-3.5 text-[#ff5f57]" />;
    }
  };

  const getStatusColor = (status: "modified" | "added" | "deleted") => {
    switch (status) {
      case "added":
        return "text-[#4ec96b] bg-[#4ec96b]/10 border-[#4ec96b]/20";
      case "modified":
        return "text-[#00b4ff] bg-[#00b4ff]/10 border-[#00b4ff]/20";
      case "deleted":
        return "text-[#ff5f57] bg-[#ff5f57]/10 border-[#ff5f57]/20";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] p-0 bg-[#071428] border border-[rgba(0,180,255,0.2)] text-[#e8f4ff] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-[rgba(0,180,255,0.08)] bg-gradient-to-b from-[rgba(0,212,255,0.04)] to-transparent">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.2)] flex items-center justify-center">
                <GitCommit className="w-4 h-4 text-[#00b4ff]" />
              </div>
              Commit & Push Changes
            </DialogTitle>
            <DialogDescription className="text-[#7ca8cc] text-[12px] mt-1.5 flex items-center gap-2">
              <GithubIcon className="w-3.5 h-3.5 text-[#3a6080]" />
              <span>{githubRepo}</span>
              <span className="text-[#3a6080]">•</span>
              <GitBranch className="w-3.5 h-3.5 text-[#3a6080]" />
              <span>{githubBranch}</span>
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Changed Files */}
          <div className="space-y-2">
            <Label className="text-[11px] text-[#7ca8cc] font-jetbrains uppercase tracking-wider">
              Staged Changes ({changes.length})
            </Label>

            {loadingChanges ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 text-[#00b4ff] animate-spin" />
              </div>
            ) : changes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-[rgba(0,180,255,0.1)] bg-[rgba(0,0,0,0.2)]">
                <CheckCircle2 className="w-8 h-8 text-[#4ec96b] opacity-80 mb-2" />
                <p className="text-xs text-[#7ca8cc] font-semibold">No changes detected</p>
                <p className="text-[10px] text-[#3a6080]">Your working copy is clean</p>
              </div>
            ) : (
              <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {changes.map((change) => (
                  <div
                    key={change.path}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgba(0,0,0,0.2)] border border-[rgba(0,180,255,0.06)]"
                  >
                    <span className="text-xs font-jetbrains truncate text-[#e8f4ff] max-w-[340px]">
                      {change.path}
                    </span>
                    <span
                      className={`text-[9px] font-semibold font-jetbrains uppercase px-2 py-0.5 rounded-full border ${getStatusColor(
                        change.status
                      )} flex items-center gap-1`}
                    >
                      {getStatusIcon(change.status)}
                      {change.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Commit Message */}
          <div className="space-y-2">
            <Label htmlFor="message" className="text-[11px] text-[#7ca8cc] font-jetbrains uppercase tracking-wider">
              Commit Message
            </Label>
            <Input
              id="message"
              placeholder="e.g. Update component structure"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              disabled={changes.length === 0 || committing}
              className="h-10 bg-[rgba(0,0,0,0.3)] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] rounded-xl font-jetbrains text-[13px] placeholder:text-[#3a6080] focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-[#00b4ff] disabled:opacity-40"
            />
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-[rgba(0,180,255,0.08)] bg-[rgba(5,13,26,0.3)]">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={committing}
            className="border border-[rgba(0,180,255,0.15)] bg-transparent text-[#7ca8cc] hover:bg-[rgba(0,180,255,0.08)] hover:text-white font-jetbrains text-[13px] rounded-xl cursor-pointer"
          >
            Close
          </Button>
          <Button
            onClick={handleCommit}
            disabled={changes.length === 0 || !commitMessage.trim() || committing}
            className="bg-gradient-to-r from-[#00cfff] via-[#3B82F6] to-[#a855f7] hover:opacity-90 text-white font-jetbrains text-[13px] rounded-xl shadow-[0_4px_15px_rgba(0,207,255,0.2)] disabled:opacity-40 cursor-pointer"
          >
            {committing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Pushing...
              </>
            ) : (
              <>
                <GitCommit className="w-4 h-4 mr-2" />
                Commit & Push
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

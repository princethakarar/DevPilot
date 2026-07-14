"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { signIn } from "next-auth/react";
import type { WebContainer } from "@webcontainer/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  GitCommit,
  Globe,
  CheckCircle2,
  FilePlus2,
  FileEdit,
  FileWarning,
  RefreshCw,
  RotateCcw,
  Plus,
} from "lucide-react";
import { commitChangesToGithub, discardFileChanges } from "@/modules/playground/actions/commit";
import { checkGithubLink } from "@/modules/dashboard/actions/github";
import { useSourceControl, type ChangeEntry, type ChangeStatus } from "@/modules/playground/hooks/useSourceControl";
import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";
import { DeleteDialog } from "./dialogs/delete-dialog";
import { CreateGithubRepoModal } from "./dialogs/create-github-repo-modal";
import { GitHubIcon } from "@/modules/dashboard/lib/template-icons";

interface SourceControlPanelProps {
  playgroundId: string;
  githubRepo?: string | null;
  githubBranch?: string | null;
  instance?: WebContainer | null;
  writeFileSync?: (path: string, content: string) => Promise<void>;
  /** Called after a successful push, so the host can refresh its own change-state. */
  onCommitted?: () => void;
  /** Pre-fill values for the "Create GitHub Repository" modal. */
  projectTitle?: string;
  projectDescription?: string | null;
  /** Called once a repo is created+linked, so the host can refresh playgroundData (flips this panel to Commit/Push). */
  onRepoLinked?: () => void;
}

/**
 * VS Code-style Source Control view: change list + commit message + Commit/Push.
 * "Commit" only stages a message locally (no network call); "Push" performs the
 * actual GitHub sync. The backend has no separate local-commit step (a push IS
 * the commit, via the GitHub Data API), so Push is what's gated on "changes
 * exist" — Commit just captures intent first, matching the two-button UX.
 *
 * Change state itself lives in useSourceControl (shared with the rail icon's
 * badge), not local component state, so the list and the badge can't drift.
 */
export function SourceControlPanel({
  playgroundId,
  githubRepo,
  githubBranch,
  instance,
  writeFileSync,
  onCommitted,
  projectTitle,
  projectDescription,
  onRepoLinked,
}: SourceControlPanelProps) {
  const hasGithubRepo = !!(githubRepo && githubBranch);
  const { changes, isLoading, refreshChanges } = useSourceControl();
  const { setTemplateData, openFiles, setOpenFiles, closeFile } = useFileExplorer();

  const [commitMessage, setCommitMessage] = useState("");
  const [pendingCommitMessage, setPendingCommitMessage] = useState<string | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<ChangeEntry | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);
  // Only meaningful while there's no repo linked yet — decides between the
  // "Link with GitHub" and "Create GitHub Repository" empty states below.
  // null = still checking, so neither empty state flashes incorrectly first.
  const [githubAccountLinked, setGithubAccountLinked] = useState<boolean | null>(null);
  const [isCreateRepoModalOpen, setIsCreateRepoModalOpen] = useState(false);

  useEffect(() => {
    refreshChanges(playgroundId);
  }, [playgroundId, refreshChanges]);

  useEffect(() => {
    if (hasGithubRepo) return;
    let cancelled = false;
    checkGithubLink().then((result) => {
      if (!cancelled) setGithubAccountLinked(result.linked);
    });
    return () => {
      cancelled = true;
    };
  }, [hasGithubRepo]);

  const hasChanges = changes.length > 0;

  const handleCommit = () => {
    if (!commitMessage.trim()) {
      toast.error("Please enter a commit message");
      return;
    }
    setPendingCommitMessage(commitMessage.trim());
    toast.success("Changes committed — click Push to sync with GitHub");
  };

  const handlePush = async () => {
    if (!pendingCommitMessage) return;
    setIsPushing(true);
    const result = await commitChangesToGithub(playgroundId, pendingCommitMessage);
    if (result.success) {
      toast.success("Pushed to GitHub");
      setPendingCommitMessage(null);
      setCommitMessage("");
      await refreshChanges(playgroundId);
      onCommitted?.();
    } else {
      // pendingCommitMessage/commitMessage are deliberately left untouched on
      // failure — the user shouldn't have to retype the commit message to retry.
      toast.error(result.error || "Failed to push changes", {
        action: result.needsReauth
          ? {
              label: "Reconnect GitHub",
              onClick: () => signIn("github", { callbackUrl: `/playground/${playgroundId}` }),
            }
          : undefined,
      });
    }
    setIsPushing(false);
  };

  const handleDiscard = async (change: ChangeEntry) => {
    setIsDiscarding(true);
    try {
      const result = await discardFileChanges(playgroundId, change.path);
      if (!result.success || !result.newTemplateData) {
        toast.error(result.error || "Failed to discard changes");
        return;
      }

      setTemplateData(result.newTemplateData);

      const wasRemoved = result.resultingContent === null;
      const openFile = openFiles.find((f) => f.id === change.path);

      try {
        if (wasRemoved) {
          await instance?.fs?.rm?.(change.path).catch(() => {});
        } else if (writeFileSync) {
          await writeFileSync(change.path, result.resultingContent ?? "");
        }
      } catch (err) {
        console.warn("Failed to sync discarded file to WebContainer:", err);
      }

      if (openFile) {
        if (wasRemoved) {
          closeFile(openFile.id);
        } else {
          setOpenFiles(
            useFileExplorer.getState().openFiles.map((f) =>
              f.id === openFile.id
                ? {
                    ...f,
                    content: result.resultingContent ?? "",
                    originalContent: result.resultingContent ?? "",
                    hasUnsavedChanges: false,
                  }
                : f
            )
          );
        }
      }

      toast.success(`Discarded changes in ${change.path}`);
      await refreshChanges(playgroundId);
    } finally {
      setIsDiscarding(false);
      setDiscardTarget(null);
    }
  };

  const getStatusIcon = (status: ChangeStatus) => {
    switch (status) {
      case "added":
        return <FilePlus2 className="w-3.5 h-3.5 text-[#4ec96b] shrink-0" />;
      case "modified":
        return <FileEdit className="w-3.5 h-3.5 text-[#00b4ff] shrink-0" />;
      case "deleted":
        return <FileWarning className="w-3.5 h-3.5 text-[#ff5f57] shrink-0" />;
    }
  };

  if (!hasGithubRepo) {
    if (githubAccountLinked === null) {
      // Still checking — avoid flashing either empty state before we know which applies.
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
        </div>
      );
    }

    if (!githubAccountLinked) {
      return (
        <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
          <GitHubIcon className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            Connect your GitHub account to publish this project.
          </p>
          <Button
            size="sm"
            className="h-7 text-xs bg-[#24292e] hover:bg-[#2f363d] text-white border border-[rgba(255,255,255,0.1)]"
            onClick={() => signIn("github", { callbackUrl: `/playground/${playgroundId}` })}
          >
            <GitHubIcon className="h-3.5 w-3.5 mr-1.5" />
            Link with GitHub
          </Button>
        </div>
      );
    }

    return (
      <>
        <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
          <Globe className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            This project isn&apos;t on GitHub yet.
          </p>
          <Button
            size="sm"
            className="h-7 text-xs bg-gradient-to-r from-[#1a5faa] to-[#00b4ff] hover:from-[#154e8c] hover:to-[#009cd9] text-white"
            onClick={() => setIsCreateRepoModalOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Create GitHub Repository
          </Button>
        </div>
        <CreateGithubRepoModal
          isOpen={isCreateRepoModalOpen}
          onClose={() => setIsCreateRepoModalOpen(false)}
          playgroundId={playgroundId}
          defaultName={projectTitle}
          defaultDescription={projectDescription}
          onCreated={() => {
            setIsCreateRepoModalOpen(false);
            onRepoLinked?.();
          }}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Source Control
        </span>
        <button
          onClick={() => refreshChanges(playgroundId)}
          disabled={isLoading}
          title="Refresh"
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </button>
      </div>

      <div className="px-3 pb-3 space-y-2">
        <Textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message"
          disabled={!hasChanges}
          rows={2}
          className="min-h-0 text-xs"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={handleCommit}
            disabled={!hasChanges || !commitMessage.trim() || !!pendingCommitMessage}
            title={!hasChanges ? "Nothing to commit — working copy is clean" : undefined}
          >
            <GitCommit className="h-3.5 w-3.5 mr-1.5" />
            Commit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs"
            onClick={handlePush}
            disabled={!pendingCommitMessage || isPushing}
            title={!pendingCommitMessage ? "Commit first to enable push" : "Push to GitHub"}
          >
            {isPushing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Globe className="h-3.5 w-3.5 mr-1.5" />
            )}
            Push to GitHub
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Changes ({changes.length})
        </div>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : changes.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-[#4ec96b]/70" />
            <p className="text-xs text-muted-foreground">No Changes</p>
          </div>
        ) : (
          <div className="space-y-1">
            {changes.map((c) => (
              <div
                key={c.path}
                className="group/file flex items-center justify-between gap-2 px-2 py-1 rounded text-xs hover:bg-sidebar-accent/50"
              >
                <span className="truncate flex-1 font-mono text-foreground/80">{c.path}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDiscardTarget(c);
                    }}
                    title="Discard Changes"
                    className="hidden group-hover/file:flex h-5 w-5 rounded items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <span className="group-hover/file:hidden flex items-center">
                    {getStatusIcon(c.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DeleteDialog
        isOpen={!!discardTarget}
        setIsOpen={(open) => !open && !isDiscarding && setDiscardTarget(null)}
        onConfirm={() => discardTarget && handleDiscard(discardTarget)}
        title="Discard Changes"
        description="Discard changes in {item}? This cannot be undone."
        itemName={discardTarget?.path}
        confirmLabel={isDiscarding ? "Discarding..." : "Discard Changes"}
        cancelLabel="Cancel"
      />
    </div>
  );
}

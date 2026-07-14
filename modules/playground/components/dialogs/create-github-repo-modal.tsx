"use client";

import { useState, type CSSProperties } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ChevronRight, Lock, Globe, X, Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { signIn } from "next-auth/react";
import { createGithubRepoForPlayground } from "@/modules/playground/actions/create-repo";
import { sanitizeRepoName } from "@/modules/playground/lib/repo-name";

/** Same token set as the "Configure Your Project" modal, so the two read as one system. */
const MODAL_VARS = {
  "--dp-radius": "16px",
  "--dp-radius-card": "12px",
  "--dp-bg-modal": "#071428",
  "--dp-border": "rgba(0,180,255,0.2)",
  "--dp-bg-card": "rgba(255,255,255,0.02)",
  "--dp-bg-card-hover": "rgba(0,180,255,0.07)",
  "--dp-bg-card-selected": "color-mix(in srgb, var(--dp-bg-modal) 94%, var(--dp-grad-from) 6%)",
  "--dp-grad-from": "#00CFFF",
  "--dp-grad-via": "#3B82F6",
  "--dp-grad-to": "#A855F7",
  "--dp-glow-cyan": "rgba(0,207,255,0.28)",
  "--dp-glow-purple": "rgba(168,85,247,0.18)",
} as CSSProperties;

/** GitHub's own repo-name character rules — checked client-side before the button even enables. */
const GITHUB_REPO_NAME_RE = /^[a-zA-Z0-9._-]+$/;

type Phase = "idle" | "creating" | "pushing" | "error";

interface CreateGithubRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  playgroundId: string;
  defaultName?: string;
  defaultDescription?: string | null;
  /** Called once the repo is linked (success or partial-success/push-failed) so the host can refresh playground state. */
  onCreated: () => void;
}

export function CreateGithubRepoModal({
  isOpen,
  onClose,
  playgroundId,
  defaultName,
  defaultDescription,
  onCreated,
}: CreateGithubRepoModalProps) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  // Reset to a fresh pre-filled state every time the modal (re)opens, rather
  // than once on mount — it stays mounted (state lives in the parent) across
  // opens/closes. Adjusted during render rather than in a useEffect: an
  // effect here would commit one frame of stale field values before
  // re-rendering with the reset ones; comparing against the previous isOpen
  // during render and resetting immediately avoids that extra frame/render.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setName(sanitizeRepoName(defaultName || "new-project"));
      setVisibility("private");
      setDescription(defaultDescription || "");
      setNameError(null);
      setPhase("idle");
      setError(null);
      setNeedsReauth(false);
    }
  }

  const isBusy = phase === "creating" || phase === "pushing";

  const handleNameChange = (value: string) => {
    setName(value);
    if (nameError) setNameError(null);
  };

  const validateName = (value: string): string | null => {
    if (!value.trim()) return "Repository name can't be empty";
    if (!GITHUB_REPO_NAME_RE.test(value)) {
      return "Only letters, numbers, hyphens, underscores, and dots are allowed";
    }
    return null;
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    const validationError = validateName(trimmed);
    if (validationError) {
      setNameError(validationError);
      return;
    }

    setError(null);
    setNeedsReauth(false);
    setPhase("creating");
    // The server action does create-then-push in one round trip — there's no
    // real incremental progress to report, so this timer just advances the
    // label to reflect what's actually the slower half of that round trip
    // (pushing every project file) without a second network call.
    const pushLabelTimer = setTimeout(() => setPhase("pushing"), 1200);

    const result = await createGithubRepoForPlayground(playgroundId, {
      name: trimmed,
      private: visibility === "private",
      description: description.trim() || undefined,
    });
    clearTimeout(pushLabelTimer);

    if (!result.success) {
      setPhase("error");
      setError(result.error || "Failed to create repository");
      setNeedsReauth(!!result.needsReauth);
      return;
    }

    if (result.partial) {
      toast.warning(result.error || "Repository created, but the initial push failed. Push manually from Source Control.");
    } else {
      toast.success(
        <span className="inline-flex items-center gap-1.5">
          Repository created and pushed
          {result.repoUrl && (
            <a href={result.repoUrl} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
              View on GitHub <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </span>
      );
    }
    onCreated();
  };

  const handleReauth = () => {
    signIn("github", { callbackUrl: `/playground/${playgroundId}` });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isBusy && onClose()}>
      <DialogContent
        showCloseButton={false}
        style={MODAL_VARS}
        className="sm:max-w-[460px] rounded-[var(--dp-radius)] border border-[var(--dp-border)] bg-[var(--dp-bg-modal)] p-5 text-[#e8f4ff] font-sans shadow-[0_0_0_1px_rgba(0,207,255,0.08),0_25px_60px_-15px_rgba(0,0,0,0.65),0_0_45px_-12px_var(--dp-glow-cyan),0_0_65px_-20px_var(--dp-glow-purple)] duration-200 ease-out data-open:zoom-in-95 data-closed:zoom-out-95"
      >
        <DialogClose asChild>
          <button
            type="button"
            aria-label="Close"
            disabled={isBusy}
            className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-[#7ca8cc] transition-colors hover:bg-[rgba(0,180,255,0.1)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dp-grad-from)] disabled:opacity-40 disabled:pointer-events-none"
          >
            <X size={16} />
          </button>
        </DialogClose>

        <DialogHeader className="gap-3 pr-8">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--dp-grad-from)] to-[var(--dp-grad-via)] shadow-[0_0_16px_-2px_var(--dp-glow-cyan)]">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px] text-white">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </div>
            <div className="flex flex-col gap-1 pt-0.5">
              <DialogTitle className="text-xl font-bold text-white font-sans tracking-wide">
                Create GitHub Repository
              </DialogTitle>
              <DialogDescription className="text-[#7ca8cc] font-sans text-[13px] leading-relaxed">
                Publish this project&apos;s current files as a new repo on your GitHub account.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {phase === "error" && (
          <div className="rounded-lg border border-[#ff5f57]/30 bg-[#ff5f57]/10 px-3 py-2.5 mt-2">
            <p className="text-[12px] text-[#ff8f88] font-sans leading-relaxed">{error}</p>
            {needsReauth && (
              <Button
                size="sm"
                onClick={handleReauth}
                className="mt-2 h-7 text-xs bg-[#24292e] hover:bg-[#2f363d] text-white border border-[rgba(255,255,255,0.1)]"
              >
                Reconnect GitHub Account
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-5 py-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="repo-name" className="text-[11px] font-semibold uppercase tracking-wider text-[#7ca8cc]">
              Repository Name
            </Label>
            <Input
              id="repo-name"
              placeholder="my-awesome-project"
              value={name}
              disabled={isBusy}
              onChange={(e) => handleNameChange(e.target.value)}
              className={cn(
                "bg-[rgba(0,0,0,0.3)] border text-[#e8f4ff] font-jetbrains text-[14px] transition-all duration-150 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-[#3a6080]",
                nameError
                  ? "border-[#ff5f57] focus:border-[#ff5f57] focus:shadow-[0_0_0_3px_rgba(255,95,87,0.12)]"
                  : "border-[var(--dp-border)] focus:border-[var(--dp-grad-from)] focus:shadow-[0_0_0_3px_rgba(0,207,255,0.12)]"
              )}
            />
            {nameError && <span className="text-[12px] text-[#ff5f57] font-sans">{nameError}</span>}
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-[#7ca8cc]">
              Visibility
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {(["private", "public"] as const).map((option) => {
                const selected = visibility === option;
                const Icon = option === "private" ? Lock : Globe;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={isBusy}
                    aria-pressed={selected}
                    onClick={() => setVisibility(option)}
                    className={cn(
                      "group relative rounded-[var(--dp-radius-card)] p-[1px] text-left transition-all duration-150 disabled:opacity-60 disabled:pointer-events-none",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dp-grad-from)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dp-bg-modal)]",
                      selected
                        ? "bg-gradient-to-br from-[var(--dp-grad-from)] via-[var(--dp-grad-via)] to-[var(--dp-grad-to)] shadow-[0_0_18px_-4px_var(--dp-glow-cyan)]"
                        : "bg-[var(--dp-border)] hover:bg-[rgba(0,180,255,0.4)]"
                    )}
                  >
                    {selected && (
                      <span className="absolute -top-1.5 -right-1.5 z-10 flex size-4.5 items-center justify-center rounded-full bg-gradient-to-br from-[var(--dp-grad-from)] to-[var(--dp-grad-to)] shadow-[0_0_8px_-1px_var(--dp-glow-cyan)]">
                        <Check size={10} className="text-white" strokeWidth={3} />
                      </span>
                    )}
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-[calc(var(--dp-radius-card)-1px)] px-3 py-2.5 transition-colors duration-150",
                        selected ? "bg-[var(--dp-bg-card-selected)]" : "bg-[var(--dp-bg-card)] group-hover:bg-[var(--dp-bg-card-hover)]"
                      )}
                    >
                      <Icon className="size-4 shrink-0" style={{ color: selected ? "#00CFFF" : "#7ca8cc" }} />
                      <span className={cn("text-[13px] font-semibold font-sans capitalize", selected ? "text-white" : "text-[#e8f4ff]")}>
                        {option}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="repo-description" className="text-[11px] font-semibold uppercase tracking-wider text-[#7ca8cc]">
              Description (optional)
            </Label>
            <Input
              id="repo-description"
              placeholder="A short description"
              value={description}
              disabled={isBusy}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-[rgba(0,0,0,0.3)] border border-[var(--dp-border)] text-[#e8f4ff] font-jetbrains text-[14px] transition-all duration-150 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-[#3a6080] focus:border-[var(--dp-grad-from)] focus:shadow-[0_0_0_3px_rgba(0,207,255,0.12)]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-[rgba(0,180,255,0.1)]">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isBusy}
            className="border border-[var(--dp-border)] bg-transparent text-[#7ca8cc] hover:bg-[rgba(0,180,255,0.08)] hover:text-white font-jetbrains text-[13px]"
          >
            Cancel
          </Button>
          <Button
            className="bg-gradient-to-r from-[#1a5faa] to-[#00b4ff] hover:from-[#154e8c] hover:to-[#009cd9] text-white font-jetbrains text-[13px] shadow-[0_4px_15px_rgba(0,180,255,0.2)] transition-all duration-150 hover:shadow-[0_4px_24px_-2px_rgba(0,180,255,0.45)] disabled:opacity-60 disabled:shadow-none disabled:cursor-not-allowed"
            onClick={handleCreate}
            disabled={isBusy || !name.trim()}
          >
            <span className="inline-flex items-center gap-1.5">
              {phase === "creating" && (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating repository…
                </>
              )}
              {phase === "pushing" && (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Pushing files…
                </>
              )}
              {!isBusy && (
                <>
                  Create Repository <ChevronRight size={16} />
                </>
              )}
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

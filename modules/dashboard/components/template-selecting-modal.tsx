"use client";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { Templates } from "@/lib/db/schemas";
import { Check, ChevronRight, Plus, X } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { TEMPLATE_ICON, TEMPLATE_ACCENT, type IconProps } from "@/modules/dashboard/lib/template-icons";

/**
 * DevPilot design tokens for this modal only, exposed as CSS custom
 * properties on the dialog root so glow intensity / gradient stops / card
 * height can be tweaked live in DevTools without touching class strings.
 * See the bottom of this file for the full list + what each one drives.
 */
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
  "--dp-card-min-h": "98px",
} as CSSProperties;

/**
 * Order here is the visual/DOM order (grid + tab order), not just a data
 * list — the default-selected template (DEFAULT_TEMPLATE below) is kept
 * first so it renders top-left on a fresh modal open.
 */
const TEMPLATE_OPTIONS: { value: Templates; label: string; description: string }[] = [
  { value: "NODE", label: "Node.js", description: "Plain Node.js, install anything manually" },
  { value: "REACT", label: "React", description: "Vite + React + TypeScript" },
  { value: "NEXTJS", label: "Next.js", description: "App Router + Tailwind" },
  { value: "EXPRESS", label: "Express", description: "Minimal Node.js API server" },
  { value: "VUE", label: "Vue", description: "Vue 3 + Vue CLI" },
  { value: "ANGULAR", label: "Angular", description: "Angular CLI starter" },
];

const DEFAULT_TEMPLATE: Templates = "NODE";

type TemplateSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Returns true on success (modal closes + resets) or false on failure (modal stays open so the user can fix and retry). */
  onSubmit: (data: {
    title: string;
    template: Templates;
    description?: string;
  }) => Promise<boolean>;
};

const TemplateSelectionModal = ({
  isOpen,
  onClose,
  onSubmit,
}: TemplateSelectionModalProps) => {
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Templates>(DEFAULT_TEMPLATE);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetState = () => {
    setProjectName("");
    setDescription("");
    setSelectedTemplate(DEFAULT_TEMPLATE);
    setNameError(null);
  };

  const handleCreateProject = async () => {
    const title = projectName.trim();
    if (!title) {
      setNameError("Project name can't be empty");
      return;
    }
    setNameError(null);
    setIsSubmitting(true);
    const success = await onSubmit({
      title,
      template: selectedTemplate,
      description: description,
    });
    setIsSubmitting(false);

    if (success) {
      onClose();
      resetState();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          resetState();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        style={MODAL_VARS}
        className="sm:max-w-[560px] rounded-[var(--dp-radius)] border border-[var(--dp-border)] bg-[var(--dp-bg-modal)] p-5 text-[#e8f4ff] font-sans shadow-[0_0_0_1px_rgba(0,207,255,0.08),0_25px_60px_-15px_rgba(0,0,0,0.65),0_0_45px_-12px_var(--dp-glow-cyan),0_0_65px_-20px_var(--dp-glow-purple)] duration-200 ease-out data-open:zoom-in-95 data-closed:zoom-out-95"
      >
        <DialogClose asChild>
          <button
            type="button"
            aria-label="Close"
            className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-[#7ca8cc] transition-colors hover:bg-[rgba(0,180,255,0.1)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dp-grad-from)]"
          >
            <X size={16} />
          </button>
        </DialogClose>

        <DialogHeader className="gap-3 pr-8">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--dp-grad-from)] to-[var(--dp-grad-via)] shadow-[0_0_16px_-2px_var(--dp-glow-cyan)]">
              <Plus size={18} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col gap-1 pt-0.5">
              <DialogTitle className="text-xl font-bold text-white font-sans tracking-wide">
                Configure Your Project
              </DialogTitle>
              <DialogDescription className="text-[#7ca8cc] font-sans text-[13px] leading-relaxed">
                Pick a starter template — dependencies install automatically when the project opens.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4">
          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-[#7ca8cc]">
              Template
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEMPLATE_OPTIONS.map((option) => {
                const Icon = TEMPLATE_ICON[option.value]!;
                const accent = TEMPLATE_ACCENT[option.value]!;
                const selected = selectedTemplate === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedTemplate(option.value)}
                    className={cn(
                      "group relative rounded-[var(--dp-radius-card)] p-[1px] text-left transition-all duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dp-grad-from)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dp-bg-modal)]",
                      selected
                        ? "bg-gradient-to-br from-[var(--dp-grad-from)] via-[var(--dp-grad-via)] to-[var(--dp-grad-to)] shadow-[0_0_20px_-4px_var(--dp-glow-cyan)]"
                        : "bg-[var(--dp-border)] hover:bg-[rgba(0,180,255,0.4)] hover:-translate-y-px"
                    )}
                  >
                    {selected && (
                      <span className="absolute -top-1.5 -right-1.5 z-10 flex size-4.5 items-center justify-center rounded-full bg-gradient-to-br from-[var(--dp-grad-from)] to-[var(--dp-grad-to)] shadow-[0_0_8px_-1px_var(--dp-glow-cyan)]">
                        <Check size={10} className="text-white" strokeWidth={3} />
                      </span>
                    )}
                    <div
                      className={cn(
                        "flex h-full min-h-[var(--dp-card-min-h)] flex-col gap-1.5 rounded-[calc(var(--dp-radius-card)-1px)] p-3 transition-colors duration-150",
                        selected ? "bg-[var(--dp-bg-card-selected)]" : "bg-[var(--dp-bg-card)] group-hover:bg-[var(--dp-bg-card-hover)]"
                      )}
                    >
                      <Icon
                        className="size-5 shrink-0 transition-colors duration-150"
                        style={{ color: selected ? accent : "#7ca8cc" }}
                      />
                      <span className={cn("text-[13px] font-semibold font-sans", selected ? "text-white" : "text-[#e8f4ff]")}>
                        {option.label}
                      </span>
                      <span className="text-[11px] text-[#7ca8cc] leading-snug line-clamp-2 font-sans">
                        {option.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name" className="text-[11px] font-semibold uppercase tracking-wider text-[#7ca8cc]">
              Project Name
            </Label>
            <Input
              id="project-name"
              placeholder="my-awesome-project"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value);
                if (nameError) setNameError(null);
              }}
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
            <Label htmlFor="description" className="text-[11px] font-semibold uppercase tracking-wider text-[#7ca8cc]">
              Description (optional)
            </Label>
            <Input
              id="description"
              placeholder="A short description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-[rgba(0,0,0,0.3)] border border-[var(--dp-border)] text-[#e8f4ff] font-jetbrains text-[14px] transition-all duration-150 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-[#3a6080] focus:border-[var(--dp-grad-from)] focus:shadow-[0_0_0_3px_rgba(0,207,255,0.12)]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[rgba(0,180,255,0.1)]">
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="border border-[var(--dp-border)] bg-transparent text-[#7ca8cc] hover:bg-[rgba(0,180,255,0.08)] hover:text-white font-jetbrains text-[13px]"
            >
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-[#1a5faa] to-[#00b4ff] hover:from-[#154e8c] hover:to-[#009cd9] text-white font-jetbrains text-[13px] shadow-[0_4px_15px_rgba(0,180,255,0.2)] transition-all duration-150 hover:shadow-[0_4px_24px_-2px_rgba(0,180,255,0.45)] disabled:opacity-60 disabled:shadow-none disabled:cursor-not-allowed"
              onClick={handleCreateProject}
              disabled={isSubmitting}
            >
              <span className="inline-flex items-center gap-1.5">
                {isSubmitting ? "Creating…" : (<>Create Project <ChevronRight size={16} /></>)}
              </span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateSelectionModal;

/**
 * ─── Tweakable design tokens (MODAL_VARS above) ────────────────────────────
 * All live as CSS custom properties on the DialogContent root, so any of
 * these can be edited live in DevTools (inspect the dialog element, edit the
 * `style` attribute) without touching this file:
 *
 *   --dp-radius        modal corner radius (16px)
 *   --dp-radius-card   template card corner radius (12px)
 *   --dp-bg-modal      modal background (#071428, matches the app's other primary
 *                      dialogs — GitHub import, profile menu — not the lighter
 *                      #0a1f3d used by secondary/nested popovers)
 *   --dp-border        default 1px border tone used across modal + cards + inputs
 *   --dp-bg-card          template card resting background
 *   --dp-bg-card-hover    unselected template card hover background
 *   --dp-bg-card-selected selected template card background. Must be an OPAQUE color
 *                         (via color-mix against --dp-bg-modal), not a translucent
 *                         rgba tint like --dp-bg-card/--dp-bg-card-hover: the layer
 *                         directly behind this card is the opaque gradient border
 *                         (see the button's own background below), so a low-opacity
 *                         rgba here barely dims it and the gradient shows through,
 *                         washing out the description text and icon. Kept as its own
 *                         variable (rather than reusing --dp-bg-card-hover) so
 *                         selected-state intensity can be tuned independently of the
 *                         unselected hover feedback.
 *   --dp-grad-from     brand gradient start (cyan) — icon chip, selected card border, focus rings
 *   --dp-grad-via      brand gradient middle (blue)
 *   --dp-grad-to       brand gradient end (purple)
 *   --dp-glow-cyan     cyan glow color used in modal shadow + selected card + icon chip
 *   --dp-glow-purple   purple glow color used in modal shadow (paired with --dp-glow-cyan)
 *   --dp-card-min-h    template card min-height, keeps all 6 cards equal height (98px)
 *
 * Not made into a variable: per-template icon accent colors (TEMPLATE_ACCENT
 * above) — these are brand colors per framework (React cyan, Vue green,
 * Angular red, Node green), not part of the DevPilot theme, so they live as
 * a plain object instead of CSS vars.
 *
 * Skipped by design (flagging per the request):
 *  - Overlay darkening/blur: DialogOverlay is a shared primitive
 *    (components/ui/dialog.tsx) used by every dialog in the app. Deepening
 *    it here would silently reskin all of them; left untouched as an
 *    intentional scope boundary — happy to do it as its own change if wanted.
 *  - Arrow-key navigation between template cards: the cards are plain
 *    `<button>`s (native Tab focus + Enter/Space activation already works),
 *    but roving-tabindex arrow-key nav would need a small keyboard
 *    controller (refs + keydown handler) — real interaction-logic work, not
 *    styling, so skipped per the "flag instead" instruction.
 *  - Disabling "Create Project" when the name is empty: wiring `disabled`
 *    to the empty-name check would silently swallow the click instead of
 *    showing the existing inline "Project name can't be empty" error —
 *    that's a UX regression, not a style change, so the button stays
 *    clickable and validates on click exactly as before.
 */

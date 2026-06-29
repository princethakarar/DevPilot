"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";

type TemplateSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    template: "NODE";
    description?: string;
  }) => void;
};

const TemplateSelectionModal = ({
  isOpen,
  onClose,
  onSubmit,
}: TemplateSelectionModalProps) => {
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");

  const handleCreateProject = () => {
    onSubmit({
      title: projectName || "New Node.js Project",
      template: "NODE",
      description: description,
    });
    onClose();
    // Reset state for next time
    setProjectName("");
    setDescription("");
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          // Reset state when closing
          setProjectName("");
          setDescription("");
        }
      }}
    >
      <DialogContent className="sm:max-w-[500px] bg-[#0a1f3d] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] font-sans">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white flex items-center gap-2 font-sans tracking-wide">
            <Plus size={24} className="text-[#00CFFF]" />
            Configure Your Project
          </DialogTitle>
          <DialogDescription className="text-[#7ca8cc] font-sans text-[13px]">
            Create a plain Node.js project. You can install frameworks manually via the terminal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name" className="text-[#7ca8cc] font-sans text-[13px]">Project Name</Label>
            <Input
              id="project-name"
              placeholder="my-awesome-project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="bg-[rgba(0,0,0,0.3)] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] font-jetbrains text-[14px] focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-[#00CFFF]"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description" className="text-[#7ca8cc] font-sans text-[13px]">Description (optional)</Label>
            <Input
              id="description"
              placeholder="A simple Node.js app"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-[rgba(0,0,0,0.3)] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] font-jetbrains text-[14px] focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-[#00CFFF]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[rgba(0,180,255,0.1)]">
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="border border-[rgba(0,180,255,0.15)] bg-transparent text-[#7ca8cc] hover:bg-[rgba(0,180,255,0.08)] hover:text-white font-jetbrains text-[13px]">
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-[#1a5faa] to-[#00b4ff] hover:from-[#154e8c] hover:to-[#009cd9] text-white font-jetbrains text-[13px] shadow-[0_4px_15px_rgba(0,180,255,0.2)]"
              onClick={handleCreateProject}
            >
              Create Project <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateSelectionModal;

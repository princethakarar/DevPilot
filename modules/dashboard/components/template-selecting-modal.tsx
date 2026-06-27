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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  ChevronRight,
  Search,
  Star,
  Code,
  Server,
  Globe,
  Zap,
  Clock,
  Check,
  Plus,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

// TemplateSelectionModal.tsx
type TemplateSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    template: "REACT" | "NEXTJS" | "EXPRESS" | "VUE" | "ANGULAR";
    description?: string;
  }) => void;
};

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  popularity: number;
  tags: string[];
  features: string[];
  category: "frontend" | "backend" | "fullstack";
}

const templates: TemplateOption[] = [
  {
    id: "react",
    name: "React",
    description:
      "A JavaScript library for building user interfaces with component-based architecture",
    icon: "/react.svg",
    color: "#61DAFB",
    popularity: 5,
    tags: ["UI", "Frontend", "JavaScript"],
    features: ["Component-Based", "Virtual DOM", "JSX Support"],
    category: "frontend",
  },
  {
    id: "nextjs",
    name: "Next.js",
    description:
      "The React framework for production with server-side rendering and static site generation",
    icon: "/nextjs-icon.svg",
    color: "#000000",
    popularity: 4,
    tags: ["React", "SSR", "Fullstack"],
    features: ["Server Components", "API Routes", "File-based Routing"],
    category: "fullstack",
  },
  {
    id: "express",
    name: "Express",
    description:
      "Fast, unopinionated, minimalist web framework for Node.js to build APIs and web applications",
    icon: "/expressjs-icon.svg",
    color: "#000000",
    popularity: 4,
    tags: ["Node.js", "API", "Backend"],
    features: ["Middleware", "Routing", "HTTP Utilities"],
    category: "backend",
  },
  {
    id: "vue",
    name: "Vue.js",
    description:
      "Progressive JavaScript framework for building user interfaces with an approachable learning curve",
    icon: "/vuejs-icon.svg",
    color: "#4FC08D",
    popularity: 4,
    tags: ["UI", "Frontend", "JavaScript"],
    features: ["Reactive Data Binding", "Component System", "Virtual DOM"],
    category: "frontend",
  },

  {
    id: "angular",
    name: "Angular",
    description:
      "A component-based development platform for building fast, reliable, and scalable web applications",
    icon: "/angular-2.svg",
    color: "#DD0031",
    popularity: 3,
    tags: ["Angular", "Frontend", "TypeScript"],
    features: [
      "Two-Way Binding",
      "Component-Based",
      "Dependency Injection",
      "TypeScript Support",
      "RxJS Integration",
    ],
    category: "frontend",
  },
];

const TemplateSelectionModal = ({
  isOpen,
  onClose,
  onSubmit,
}: TemplateSelectionModalProps) => {
  const [step, setStep] = useState<"select" | "configure">("select");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<
    "all" | "frontend" | "backend" | "fullstack"
  >("all");
  const [projectName, setProjectName] = useState("");

  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      );

    const matchesCategory =
      category === "all" || template.category === category;

    return matchesCategory && matchesSearch;
  });

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
  };

  const handleContinue = () => {
    if (selectedTemplate) {
      setStep("configure");
    }
  };

  const handleCreateProject = () => {
    if (selectedTemplate) {
      const templateMap: Record<
        string,
        "REACT" | "NEXTJS" | "EXPRESS" | "VUE" | "ANGULAR"
      > = {
        react: "REACT",
        nextjs: "NEXTJS",
        express: "EXPRESS",
        vue: "VUE",
        angular: "ANGULAR",
      };

      const template = templates.find((t) => t.id === selectedTemplate);
      onSubmit({
        title:projectName || `New ${template?.name} Project`,
        template:templateMap[selectedTemplate] || "REACT",
        description:template?.description
      })
      onClose();
      // Reset state for next time
      setStep("select");
      setSelectedTemplate(null);
      setProjectName("");
    }
  };

  const handleBack = () => {
    setStep("select");
  };



  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          // Reset state when closing
          setStep("select");
          setSelectedTemplate(null);
          setProjectName("");
        }
      }}
    >
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto bg-[#0a1f3d] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] font-sans">
        {step === "select" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-white flex items-center gap-2 font-sans tracking-wide">
                <Plus size={24} className="text-[#00CFFF]" />
                Select a Template
              </DialogTitle>
              <DialogDescription className="text-[#7ca8cc] font-sans text-[13px]">
                Choose a template to create your new playground
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-6 py-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#3a6080] outline-none"
                    size={18}
                  />
                  <Input
                    placeholder="Search templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-[rgba(0,0,0,0.3)] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] font-jetbrains text-[13px] focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-[#00CFFF]"
                  />
                </div>

                <Tabs
                  defaultValue="all"
                  className="w-full sm:w-auto"
                  onValueChange={(value) => setCategory(value as any)}
                >
                  <TabsList className="grid grid-cols-4 w-full sm:w-[400px] bg-[rgba(0,0,0,0.3)] border border-[rgba(0,180,255,0.15)] text-[#7ca8cc]">
                    <TabsTrigger value="all" className="data-[state=active]:bg-[#00CFFF] data-[state=active]:text-white font-jetbrains text-[11px]">All</TabsTrigger>
                    <TabsTrigger value="frontend" className="data-[state=active]:bg-[#00CFFF] data-[state=active]:text-white font-jetbrains text-[11px]">Frontend</TabsTrigger>
                    <TabsTrigger value="backend" className="data-[state=active]:bg-[#00CFFF] data-[state=active]:text-white font-jetbrains text-[11px]">Backend</TabsTrigger>
                    <TabsTrigger value="fullstack" className="data-[state=active]:bg-[#00CFFF] data-[state=active]:text-white font-jetbrains text-[11px]">Fullstack</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <RadioGroup
                value={selectedTemplate || ""}
                onValueChange={handleSelectTemplate}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTemplates.length > 0 ? (
                    filteredTemplates.map((template) => (
                      <div
                        key={template.id}
                        className={`relative flex p-6 border rounded-lg cursor-pointer transition-all duration-300 hover:scale-[1.01] bg-[rgba(7,17,31,0.4)]
                          ${
                            selectedTemplate === template.id
                              ? "border-[#00CFFF] shadow-[0_0_15px_rgba(0,195,255,0.15)] bg-[rgba(7,17,31,0.8)]"
                              : "border-[rgba(0,180,255,0.1)] hover:border-[rgba(0,180,255,0.3)] hover:shadow-[0_8px_30px_rgba(0,180,255,0.05)]"
                          }
                          `}
                        onClick={() => handleSelectTemplate(template.id)}
                      >


                        {selectedTemplate === template.id && (
                          <div className="absolute top-2 left-2 bg-[#00CFFF] text-[#050d1a] rounded-full p-1 shadow-[0_0_10px_rgba(0,195,255,0.3)]">
                            <Check size={12} className="stroke-[3]" />
                          </div>
                        )}

                        <div className="flex gap-4">
                          <div
                            className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center rounded-full border border-[rgba(0,180,255,0.15)] bg-[rgba(5,13,26,0.3)] shadow-[0_0_15px_rgba(0,180,255,0.02)]"
                            style={{ backgroundColor: `${template.color}15` }}
                          >
                            <Image
                              src={template.icon || "/placeholder.svg"}
                              alt={`${template.name} icon`}
                              width={40}
                              height={40}
                              className="object-contain"
                            />
                          </div>

                          <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-[16px] font-bold text-white font-sans">
                                {template.name}
                              </h3>
                              <div className="flex gap-1">
                                {template.category === "frontend" && (
                                  <Code size={14} className="text-[#00CFFF]" />
                                )}
                                {template.category === "backend" && (
                                  <Server
                                    size={14}
                                    className="text-[#a67bd4]"
                                  />
                                )}
                                {template.category === "fullstack" && (
                                  <Globe
                                    size={14}
                                    className="text-purple-400"
                                  />
                                )}
                              </div>
                            </div>

                            <p className="text-[12px] text-[#7ca8cc] font-jetbrains leading-relaxed mb-3">
                              {template.description}
                            </p>

                            <div className="flex flex-wrap gap-2 mt-auto">
                              {template.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[10px] px-2 py-0.5 border border-[rgba(0,180,255,0.15)] rounded-2xl bg-[rgba(0,180,255,0.05)] text-[#00b4ff] font-jetbrains"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <RadioGroupItem
                          value={template.id}
                          id={template.id}
                          className="sr-only"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 flex flex-col items-center justify-center p-8 text-center bg-[rgba(0,0,0,0.15)] border border-[rgba(0,180,255,0.08)] rounded-xl">
                      <Search size={48} className="text-[#3a6080] mb-4" />
                      <h3 className="text-lg font-medium text-white">
                        No templates found
                      </h3>
                      <p className="text-sm text-[#7ca8cc]">
                        Try adjusting your search or filters
                      </p>
                    </div>
                  )}
                </div>
              </RadioGroup>
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[rgba(0,180,255,0.1)]">
              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose} className="border border-[rgba(0,180,255,0.15)] bg-transparent text-[#7ca8cc] hover:bg-[rgba(0,180,255,0.08)] hover:text-white font-jetbrains text-[13px]">
                  Cancel
                </Button>
                <Button
                  className="bg-gradient-to-r from-[#1a5faa] to-[#00b4ff] hover:from-[#154e8c] hover:to-[#009cd9] text-white font-jetbrains text-[13px] shadow-[0_4px_15px_rgba(0,180,255,0.2)]"
                  disabled={!selectedTemplate}
                  onClick={handleContinue}
                >
                  Continue <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-white font-sans tracking-wide">
                Configure Your Project
              </DialogTitle>
              <DialogDescription className="text-[#7ca8cc] font-sans text-[13px]">
                {templates.find((t) => t.id === selectedTemplate)?.name} project
                configuration
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

              <div className="p-5 bg-[rgba(7,17,31,0.4)] border border-[rgba(0,180,255,0.15)] rounded-lg shadow-[0_4px_20px_rgba(0,180,255,0.03)]">
                <h3 className="font-bold text-white text-[14px] mb-3 font-sans">Selected Template Features</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {templates
                    .find((t) => t.id === selectedTemplate)
                    ?.features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2">
                        <Zap size={14} className="text-[#00CFFF]" />
                        <span className="text-[13px] text-[#7ca8cc] font-jetbrains">{feature}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between gap-3 mt-4 pt-4 border-t border-[rgba(0,180,255,0.1)]">
              <Button variant="outline" onClick={handleBack} className="border border-[rgba(0,180,255,0.15)] bg-transparent text-[#7ca8cc] hover:bg-[rgba(0,180,255,0.08)] hover:text-white font-jetbrains text-[13px]">
                Back
              </Button>
              <Button
                className="bg-gradient-to-r from-[#1a5faa] to-[#00b4ff] hover:from-[#154e8c] hover:to-[#009cd9] text-white font-jetbrains text-[13px] shadow-[0_4px_15px_rgba(0,180,255,0.2)]"
                onClick={handleCreateProject}
              >
                Create Project
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TemplateSelectionModal;

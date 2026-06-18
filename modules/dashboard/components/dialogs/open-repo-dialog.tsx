"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  GitBranch,
  Search,
  Loader2,
  Lock,
  Globe,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  Check,
  FolderGit2,
} from "lucide-react";
import { signIn } from "next-auth/react";

const GithubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);
import {
  checkGithubLink,
  fetchUserRepos,
  fetchRepoBranches,
  importGithubRepository,
} from "@/modules/dashboard/actions/github";

interface OpenRepoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OpenRepoDialog({ isOpen, onClose }: OpenRepoDialogProps) {
  const router = useRouter();

  // State
  const [step, setStep] = useState<"checking" | "link" | "repos" | "importing">("checking");
  const [repos, setRepos] = useState<
    { name: string; full_name: string; private: boolean; description: string | null }[]
  >([]);
  const [branches, setBranches] = useState<{ name: string }[]>([]);
  const [defaultBranch, setDefaultBranch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);

  // Check GitHub link on dialog open
  useEffect(() => {
    if (!isOpen) {
      // Reset state when dialog closes
      setStep("checking");
      setRepos([]);
      setBranches([]);
      setSelectedRepo(null);
      setSelectedBranch("");
      setSearchQuery("");
      return;
    }

    const check = async () => {
      setStep("checking");
      const result = await checkGithubLink();
      if (result.linked) {
        setStep("repos");
        loadRepos();
      } else {
        setStep("link");
      }
    };

    check();
  }, [isOpen]);

  const loadRepos = async () => {
    setLoadingRepos(true);
    const result = await fetchUserRepos();
    if (result.error) {
      toast.error(result.error);
    } else {
      setRepos(result.repos);
    }
    setLoadingRepos(false);
  };

  const handleSelectRepo = async (fullName: string) => {
    setSelectedRepo(fullName);
    setLoadingBranches(true);
    setBranches([]);
    setSelectedBranch("");

    const [owner, repo] = fullName.split("/");
    const result = await fetchRepoBranches(owner, repo);

    if (result.error) {
      toast.error(result.error);
    } else {
      setBranches(result.branches);
      setDefaultBranch(result.defaultBranch || "main");
      setSelectedBranch(result.defaultBranch || result.branches[0]?.name || "main");
    }
    setLoadingBranches(false);
  };

  const handleImport = async () => {
    if (!selectedRepo || !selectedBranch) return;

    setImporting(true);
    setStep("importing");

    const [owner, repo] = selectedRepo.split("/");
    const result = await importGithubRepository(owner, repo, selectedBranch);

    if (result.error) {
      toast.error(result.error);
      setStep("repos");
    } else if (result.playgroundId) {
      toast.success("Repository imported successfully!");
      onClose();
      router.push(`/playground/${result.playgroundId}`);
    }

    setImporting(false);
  };

  const handleSyncGithub = () => {
    signIn("github", { callbackUrl: "/dashboard" });
  };

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px] p-0 bg-[#071428] border border-[rgba(0,180,255,0.2)] text-[#e8f4ff] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-[rgba(0,180,255,0.08)]">
          <div className="absolute inset-0 bg-gradient-to-b from-[rgba(168,85,247,0.06)] to-transparent pointer-events-none" />
          <DialogHeader className="relative">
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[rgba(168,85,247,0.15)] border border-[rgba(168,85,247,0.25)] flex items-center justify-center">
                <FolderGit2 className="w-4.5 h-4.5 text-[#a67bd4]" />
              </div>
              Open GitHub Repository
            </DialogTitle>
            <DialogDescription className="text-[#7ca8cc] text-[13px] mt-1.5">
              Import a repository from GitHub to edit in DevPilot.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Content */}
        <div className="px-6 py-4 min-h-[300px]">
          {/* Checking state */}
          {step === "checking" && (
            <div className="flex flex-col items-center justify-center h-[280px] gap-3">
              <Loader2 className="h-8 w-8 text-[#00b4ff] animate-spin" />
              <p className="text-sm text-[#7ca8cc] font-jetbrains">
                Checking GitHub connection...
              </p>
            </div>
          )}

          {/* Link GitHub state */}
          {step === "link" && (
            <div className="flex flex-col items-center justify-center h-[280px] gap-5">
              <div className="w-16 h-16 rounded-2xl bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.2)] flex items-center justify-center">
                <GithubIcon className="w-8 h-8 text-[#a67bd4]" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-white">
                  Link Your GitHub Account
                </h3>
                <p className="text-sm text-[#7ca8cc] max-w-[360px]">
                  To access your repositories, you need to link your GitHub account. This grants DevPilot permission to read and write to your repos.
                </p>
              </div>
              <Button
                onClick={handleSyncGithub}
                className="bg-[#24292e] hover:bg-[#2f363d] text-white px-6 py-2.5 rounded-xl flex items-center gap-2.5 text-sm font-semibold border border-[rgba(255,255,255,0.1)] shadow-[0_4px_15px_rgba(0,0,0,0.3)] transition-all duration-300 hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)] cursor-pointer"
              >
                <GithubIcon className="w-4.5 h-4.5" />
                Sync GitHub Account
              </Button>
            </div>
          )}

          {/* Repository selection */}
          {step === "repos" && (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a6080]" />
                <Input
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 bg-[rgba(0,0,0,0.3)] border border-[rgba(0,180,255,0.15)] text-[#e8f4ff] rounded-xl font-jetbrains text-[13px] placeholder:text-[#3a6080] focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-[rgba(0,180,255,0.4)]"
                />
              </div>

              {/* Repo list */}
              <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {loadingRepos ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 text-[#00b4ff] animate-spin" />
                  </div>
                ) : filteredRepos.length === 0 ? (
                  <div className="text-center py-8 text-[#3a6080] text-sm font-jetbrains">
                    {searchQuery ? "No repositories match your search" : "No repositories found"}
                  </div>
                ) : (
                  filteredRepos.map((repo) => (
                    <button
                      key={repo.full_name}
                      onClick={() => handleSelectRepo(repo.full_name)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                        selectedRepo === repo.full_name
                          ? "bg-[rgba(0,180,255,0.1)] border border-[rgba(0,180,255,0.3)]"
                          : "hover:bg-[rgba(0,180,255,0.04)] border border-transparent"
                      }`}
                    >
                      <div className="shrink-0">
                        {repo.private ? (
                          <Lock className="w-4 h-4 text-[#f0c040]" />
                        ) : (
                          <Globe className="w-4 h-4 text-[#4ec96b]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">
                          {repo.name}
                        </p>
                        {repo.description && (
                          <p className="text-[11px] text-[#3a6080] truncate">
                            {repo.description}
                          </p>
                        )}
                      </div>
                      {selectedRepo === repo.full_name && (
                        <Check className="w-4 h-4 text-[#00b4ff] shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Branch selection */}
              {selectedRepo && (
                <div className="border-t border-[rgba(0,180,255,0.08)] pt-4 space-y-2">
                  <Label className="text-[12px] text-[#7ca8cc] font-jetbrains uppercase tracking-wider">
                    Branch
                  </Label>
                  {loadingBranches ? (
                    <div className="flex items-center gap-2 text-[#7ca8cc] text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="font-jetbrains text-xs">Loading branches...</span>
                    </div>
                  ) : (
                    <div className="relative">
                      <button
                        onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                        className="w-full flex items-center justify-between h-10 px-3 bg-[rgba(0,0,0,0.3)] border border-[rgba(0,180,255,0.15)] rounded-xl text-[13px] font-jetbrains text-[#e8f4ff] hover:border-[rgba(0,180,255,0.3)] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-3.5 h-3.5 text-[#00b4ff]" />
                          <span>{selectedBranch}</span>
                          {selectedBranch === defaultBranch && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(0,180,255,0.1)] text-[#00b4ff] border border-[rgba(0,180,255,0.2)]">
                              default
                            </span>
                          )}
                        </div>
                        <ChevronDown className="w-4 h-4 text-[#3a6080]" />
                      </button>

                      {showBranchDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#0a1f3d] border border-[rgba(0,180,255,0.2)] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-50 max-h-[150px] overflow-y-auto">
                          {branches.map((branch) => (
                            <button
                              key={branch.name}
                              onClick={() => {
                                setSelectedBranch(branch.name);
                                setShowBranchDropdown(false);
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] font-jetbrains text-left transition-colors cursor-pointer ${
                                selectedBranch === branch.name
                                  ? "text-[#00b4ff] bg-[rgba(0,180,255,0.08)]"
                                  : "text-[#7ca8cc] hover:bg-[rgba(0,180,255,0.04)] hover:text-white"
                              }`}
                            >
                              <GitBranch className="w-3 h-3" />
                              {branch.name}
                              {branch.name === defaultBranch && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-[rgba(0,180,255,0.1)] text-[#00b4ff] ml-auto">
                                  default
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Importing state */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center h-[280px] gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-[rgba(0,180,255,0.1)] border border-[rgba(0,180,255,0.2)] flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-[#00b4ff] animate-spin" />
                </div>
                <div className="absolute -inset-2 rounded-2xl bg-[rgba(0,180,255,0.1)] blur-xl animate-pulse" />
              </div>
              <div className="text-center space-y-1.5">
                <h3 className="text-lg font-semibold text-white">Importing Repository</h3>
                <p className="text-sm text-[#7ca8cc] font-jetbrains">
                  Fetching files from <span className="text-[#00b4ff]">{selectedRepo}</span>...
                </p>
                <p className="text-[11px] text-[#3a6080] font-jetbrains">
                  This may take a moment for large repositories.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "repos" && (
          <DialogFooter className="px-6 py-4 border-t border-[rgba(0,180,255,0.08)] bg-[rgba(5,13,26,0.3)]">
            <Button
              variant="outline"
              onClick={onClose}
              className="border border-[rgba(0,180,255,0.15)] bg-transparent text-[#7ca8cc] hover:bg-[rgba(0,180,255,0.08)] hover:text-white font-jetbrains text-[13px] rounded-xl cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!selectedRepo || !selectedBranch || importing}
              className="bg-gradient-to-r from-[#6d28d9] to-[#a855f7] hover:from-[#5b21b6] hover:to-[#9333ea] text-white font-jetbrains text-[13px] rounded-xl shadow-[0_4px_15px_rgba(168,85,247,0.25)] disabled:opacity-40 cursor-pointer"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <FolderGit2 className="w-4 h-4 mr-2" />
                  Open Repository
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  File,
  Folder,
  Plus,
  FilePlus,
  FolderPlus,
  MoreHorizontal,
  Trash2,
  Edit3,
  FolderMinus,
  RefreshCw,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";

import RenameFolderDialog from "./dialogs/rename-folder-dialog";
import NewFolderDialog from "./dialogs/new-folder-dialog";
import NewFileDialog from "./dialogs/new-file-dialog";
import RenameFileDialog from "./dialogs/rename-file-dialog";
import { DeleteDialog } from "./dialogs/delete-dialog";

interface TemplateFile {
  filename: string;
  fileExtension: string;
  content: string;
}


interface TemplateFolder {
  folderName: string;
  items: (TemplateFile | TemplateFolder)[];
}

type TemplateItem = TemplateFile | TemplateFolder;

interface TemplateFileTreeProps {
  data: TemplateItem;
  onFileSelect?: (file: TemplateFile, isPreview?: boolean) => void;
  selectedFile?: TemplateFile;
  title?: string;
  onAddFile?: (file: TemplateFile, parentPath: string) => void;
  onAddFolder?: (folder: TemplateFolder, parentPath: string) => void;
  onDeleteFile?: (file: TemplateFile, parentPath: string) => void;
  onDeleteFolder?: (folder: TemplateFolder, parentPath: string) => void;
  onRenameFile?: (
    file: TemplateFile,
    newFilename: string,
    newExtension: string,
    parentPath: string
  ) => void;
  onRenameFolder?: (
    folder: TemplateFolder,
    newFolderName: string,
    parentPath: string
  ) => void;
  onRefresh?: () => Promise<void>;
}

export function TemplateFileTree({
  data,
  onFileSelect,
  selectedFile,
  title = "Files Explorer",
  onAddFile,
  onAddFolder,
  onDeleteFile,
  onDeleteFolder,
  onRenameFile,
  onRenameFolder,
  onRefresh,
}: TemplateFileTreeProps) {
  const isRootFolder = data && typeof data === "object" && "folderName" in data;
  const [isNewFileDialogOpen, setIsNewFileDialogOpen] = React.useState(false);
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] =
    React.useState(false);
  const [collapseTrigger, setCollapseTrigger] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleAddRootFile = () => {
    setIsNewFileDialogOpen(true);
  };

  const handleAddRootFolder = () => {
    setIsNewFolderDialogOpen(true);
  };

  const handleCollapseAll = () => {
    setCollapseTrigger((prev) => prev + 1);
  };

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  const handleCreateFile = (filename: string, extension: string) => {
    if (onAddFile && isRootFolder) {
      const newFile: TemplateFile = {
        filename,
        fileExtension: extension,
        content: "",
      };
      onAddFile(newFile, "");
    }
    setIsNewFileDialogOpen(false);
  };

  const handleCreateFolder = (folderName: string) => {
    if (onAddFolder && isRootFolder) {
      const newFolder: TemplateFolder = {
        folderName,
        items: [],
      };
      onAddFolder(newFolder, "");
    }
    setIsNewFolderDialogOpen(false);
  };

  return (
    <Sidebar className="border-r border-[#1E2D45] bg-[#0A0F1C]">
      <SidebarContent className="bg-transparent py-4 px-3">
        <SidebarGroup className="p-0">
          <div className="flex items-center justify-between px-3 py-2 mb-4">
            <span className="text-[9px] font-medium font-sans uppercase tracking-[0.12em] text-[#A5B8CC]">
              {title}
            </span>
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={handleAddRootFile}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-[#CBD5E1] hover:text-[#38BDF8] hover:bg-[#1A2236] transition-all duration-200 cursor-pointer outline-none border-none"
                  >
                    <FilePlus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#071428] border border-[rgba(0,180,255,0.25)] text-[#e8f4ff] font-jetbrains text-xs">New File</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={handleAddRootFolder}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-[#CBD5E1] hover:text-[#38BDF8] hover:bg-[#1A2236] transition-all duration-200 cursor-pointer outline-none border-none"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#0D1221] border border-[#1E2D45] text-[#E2EAF4] font-sans text-xs">New Folder</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-[#CBD5E1] hover:text-[#38BDF8] hover:bg-[#1A2236] transition-all duration-200 cursor-pointer outline-none border-none disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#0D1221] border border-[#1E2D45] text-[#E2EAF4] font-sans text-xs">Sync from Terminal</TooltipContent>
              </Tooltip>
 
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={handleCollapseAll}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-[#CBD5E1] hover:text-[#38BDF8] hover:bg-[#1A2236] transition-all duration-200 cursor-pointer outline-none border-none"
                  >
                    <FolderMinus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#0D1221] border border-[#1E2D45] text-[#E2EAF4] font-sans text-xs">Collapse All Folders</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1.5">
              {isRootFolder ? (
                (data as TemplateFolder).items.map((child, index) => (
                  <TemplateNode
                    key={index}
                    item={child}
                    onFileSelect={onFileSelect}
                    selectedFile={selectedFile}
                    level={0}
                    path=""
                    onAddFile={onAddFile}
                    onAddFolder={onAddFolder}
                    onDeleteFile={onDeleteFile}
                    onDeleteFolder={onDeleteFolder}
                    onRenameFile={onRenameFile}
                    onRenameFolder={onRenameFolder}
                    collapseTrigger={collapseTrigger}
                  />
                ))
              ) : (
                <TemplateNode
                  item={data}
                  onFileSelect={onFileSelect}
                  selectedFile={selectedFile}
                  level={0}
                  path=""
                  onAddFile={onAddFile}
                  onAddFolder={onAddFolder}
                  onDeleteFile={onDeleteFile}
                  onDeleteFolder={onDeleteFolder}
                  onRenameFile={onRenameFile}
                  onRenameFolder={onRenameFolder}
                  collapseTrigger={collapseTrigger}
                />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />

      <NewFileDialog
        isOpen={isNewFileDialogOpen}
        onClose={() => setIsNewFileDialogOpen(false)}
        onCreateFile={handleCreateFile}
      />

      <NewFolderDialog
        isOpen={isNewFolderDialogOpen}
        onClose={() => setIsNewFolderDialogOpen(false)}
        onCreateFolder={handleCreateFolder}
      />
    </Sidebar>
  );
}

interface TemplateNodeProps {
  item: TemplateItem;
  onFileSelect?: (file: TemplateFile, isPreview?: boolean) => void;
  selectedFile?: TemplateFile;
  level: number;
  path?: string;
  onAddFile?: (file: TemplateFile, parentPath: string) => void;
  onAddFolder?: (folder: TemplateFolder, parentPath: string) => void;
  onDeleteFile?: (file: TemplateFile, parentPath: string) => void;
  onDeleteFolder?: (folder: TemplateFolder, parentPath: string) => void;
  onRenameFile?: (
    file: TemplateFile,
    newFilename: string,
    newExtension: string,
    parentPath: string
  ) => void;
  onRenameFolder?: (
    folder: TemplateFolder,
    newFolderName: string,
    parentPath: string
  ) => void;
  collapseTrigger?: number;
}

function TemplateNode({
  item,
  onFileSelect,
  selectedFile,
  level,
  path = "",
  onAddFile,
  onAddFolder,
  onDeleteFile,
  onDeleteFolder,
  onRenameFile,
  onRenameFolder,
  collapseTrigger = 0,
}: TemplateNodeProps) {
  const isValidItem = item && typeof item === "object";
  const isFolder = isValidItem && "folderName" in item;
  const [isNewFileDialogOpen, setIsNewFileDialogOpen] = React.useState(false);
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] =
    React.useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(level < 2);

  React.useEffect(() => {
    if (collapseTrigger > 0 && isFolder) {
      setIsOpen(false);
    }
  }, [collapseTrigger, isFolder]);

  if (!isValidItem) return null;

  if (!isFolder) {
    const file = item as TemplateFile;
    const fileName = `${file.filename}.${file.fileExtension}`;

    const isSelected = !!(
      selectedFile &&
      selectedFile.filename === file.filename &&
      selectedFile.fileExtension === file.fileExtension
    );

    const handleRename = () => {
      setIsRenameDialogOpen(true);
    };

    const handleDelete = () => {
      setIsDeleteDialogOpen(true);
    };

    const confirmDelete = () => {
      onDeleteFile?.(file, path);
      setIsDeleteDialogOpen(false);
    };

    const handleRenameSubmit = (newFilename: string, newExtension: string) => {
      onRenameFile?.(file, newFilename, newExtension, path);
      setIsRenameDialogOpen(false);
    };

    const getFileIconColor = (selected: boolean) => {
      return selected ? "text-[#38BDF8]" : "text-[#CBD5E1]";
    };
 
    return (
      <SidebarMenuItem className="relative group/item">
        <SidebarMenuButton
          isActive={isSelected}
          onClick={() => onFileSelect?.(file, true)}
          onDoubleClick={() => onFileSelect?.(file, false)}
          style={isSelected ? { textShadow: "0 0 8px rgba(56,189,248,0.3)" } : undefined}
          className={cn(
            "w-full flex items-center px-3 py-1.5 text-[13px] rounded-none transition-all duration-200 cursor-pointer font-sans outline-none border-none",
            isSelected 
              ? "bg-[#111827] text-[#E2EAF4] border-l-2 border-l-[#38BDF8]" 
              : "text-[#CBD5E1] hover:text-[#E2EAF4] hover:bg-[#0D1627] bg-transparent"
          )}
        >
          <File className={cn("h-4 w-4 mr-2 shrink-0", getFileIconColor(isSelected))} />
          <span className="truncate">{fileName}</span>
        </SidebarMenuButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction showOnHover className="text-[#3a6080] hover:text-[#00D4FF] hover:bg-[#00D4FF]/10 rounded-md transition-all">
              <MoreHorizontal className="h-4 w-4" />
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 bg-[#071428] border border-[rgba(0,180,255,0.25)] text-[#e8f4ff] rounded-xl overflow-hidden shadow-2xl p-1">
            <DropdownMenuItem onClick={handleRename} className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-[#00D4FF]/10 cursor-pointer transition-colors focus:bg-[#00D4FF]/10 focus:text-white">
              <Edit3 className="h-3.5 w-3.5 text-[#00D4FF]" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[rgba(0,180,255,0.08)]" />
            <DropdownMenuItem
              onClick={handleDelete}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors focus:bg-rose-500/10 focus:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <RenameFileDialog
          isOpen={isRenameDialogOpen}
          onClose={() => setIsRenameDialogOpen(false)}
          onRename={handleRenameSubmit}
          currentFilename={file.filename}
          currentExtension={file.fileExtension}
        />

        <DeleteDialog
          isOpen={isDeleteDialogOpen}
          setIsOpen={setIsDeleteDialogOpen}
          onConfirm={confirmDelete}
          title="Delete File"
          description={`Are you sure you want to delete "${fileName}"? This action cannot be undone.`}
          itemName={fileName}
          confirmLabel="Delete"
          cancelLabel="Cancel"
        />
      </SidebarMenuItem>
    );
  } else {
    const folder = item as TemplateFolder;
    const folderName = folder.folderName;
    const currentPath = path ? `${path}/${folderName}` : folderName;

    const handleAddFile = () => {
      setIsNewFileDialogOpen(true);
    };

    const handleAddFolder = () => {
      setIsNewFolderDialogOpen(true);
    };

    const handleRename = () => {
      setIsRenameDialogOpen(true);
    };

    const handleDelete = () => {
      setIsDeleteDialogOpen(true);
    };

    const confirmDelete = () => {
      onDeleteFolder?.(folder, path);
      setIsDeleteDialogOpen(false);
    };

    const handleCreateFile = (filename: string, extension: string) => {
      if (onAddFile) {
        const newFile: TemplateFile = {
          filename,
          fileExtension: extension,
          content: "",
        };
        onAddFile(newFile, currentPath);
      }
      setIsNewFileDialogOpen(false);
    };

    const handleCreateFolder = (folderName: string) => {
      if (onAddFolder) {
        const newFolder: TemplateFolder = {
          folderName,
          items: [],
        };
        onAddFolder(newFolder, currentPath);
      }
      setIsNewFolderDialogOpen(false);
    };

    const handleRenameSubmit = (newFolderName: string) => {
      onRenameFolder?.(folder, newFolderName, path);
      setIsRenameDialogOpen(false);
    };

    return (
      <SidebarMenuItem className="relative group/folder">
        <Collapsible
          open={isOpen}
          onOpenChange={setIsOpen}
          className="group/collapsible w-full"
        >
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              className={cn(
                "w-full flex items-center px-3 py-1.5 text-[13px] rounded-none transition-all duration-200 cursor-pointer font-sans text-[#CBD5E1] hover:text-[#E2EAF4] hover:bg-[#0D1627] bg-transparent outline-none border-none"
              )}
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-all duration-200 text-[#A5B8CC] mr-1",
                  isOpen ? "rotate-90 text-[#CBD5E1]" : "hover:text-[#CBD5E1]"
                )}
              />
              <Folder className="h-4 w-4 mr-2 shrink-0 text-[#CBD5E1]" />
              <span className="truncate">{folderName}</span>
            </SidebarMenuButton>
          </CollapsibleTrigger>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction showOnHover className="text-[#3a6080] hover:text-[#00D4FF] hover:bg-[#00D4FF]/10 rounded-md transition-all">
                <MoreHorizontal className="h-4 w-4" />
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 bg-[#071428] border border-[rgba(0,180,255,0.25)] text-[#e8f4ff] rounded-xl overflow-hidden shadow-2xl p-1">
              <DropdownMenuItem onClick={handleAddFile} className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-[#00D4FF]/10 cursor-pointer transition-colors focus:bg-[#00D4FF]/10 focus:text-white">
                <FilePlus className="h-3.5 w-3.5 text-[#00D4FF]" />
                New File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAddFolder} className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-[#8B5CF6]/10 cursor-pointer transition-colors focus:bg-[#8B5CF6]/10 focus:text-white">
                <FolderPlus className="h-3.5 w-3.5 text-[#8B5CF6]" />
                New Folder
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[rgba(0,180,255,0.08)]" />
              <DropdownMenuItem onClick={handleRename} className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-[#00D4FF]/10 cursor-pointer transition-colors focus:bg-[#00D4FF]/10 focus:text-white">
                <Edit3 className="h-3.5 w-3.5 text-[#00D4FF]" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[rgba(0,180,255,0.08)]" />
              <DropdownMenuItem
                onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors focus:bg-rose-500/10 focus:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <CollapsibleContent>
            <SidebarMenuSub className="border-l border-[#1E2D45] ml-3 pl-2.5 space-y-1 mt-0.5">
              {folder.items.map((childItem, index) => (
                <TemplateNode
                  key={index}
                  item={childItem}
                  onFileSelect={onFileSelect}
                  selectedFile={selectedFile}
                  level={level + 1}
                  path={currentPath}
                  onAddFile={onAddFile}
                  onAddFolder={onAddFolder}
                  onDeleteFile={onDeleteFile}
                  onDeleteFolder={onDeleteFolder}
                  onRenameFile={onRenameFile}
                  onRenameFolder={onRenameFolder}
                  collapseTrigger={collapseTrigger}
                />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>

        <NewFileDialog
          isOpen={isNewFileDialogOpen}
          onClose={() => setIsNewFileDialogOpen(false)}
          onCreateFile={handleCreateFile}
        />

        <NewFolderDialog
          isOpen={isNewFolderDialogOpen}
          onClose={() => setIsNewFolderDialogOpen(false)}
          onCreateFolder={handleCreateFolder}
        />

        <RenameFolderDialog
          isOpen={isRenameDialogOpen}
          onClose={() => setIsRenameDialogOpen(false)}
          onRename={handleRenameSubmit}
          currentFolderName={folderName}
        />

        <DeleteDialog
          isOpen={isDeleteDialogOpen}
          setIsOpen={setIsDeleteDialogOpen}
          onConfirm={confirmDelete}
          title="Delete Folder"
          description={`Are you sure you want to delete "${folderName}" and all its contents? This action cannot be undone.`}
          itemName={folderName}
          confirmLabel="Delete"
          cancelLabel="Cancel"
        />
      </SidebarMenuItem>
    );
  }
}

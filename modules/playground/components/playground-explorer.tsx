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
  onFileSelect?: (file: TemplateFile) => void;
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
}: TemplateFileTreeProps) {
  const isRootFolder = data && typeof data === "object" && "folderName" in data;
  const [isNewFileDialogOpen, setIsNewFileDialogOpen] = React.useState(false);
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] =
    React.useState(false);
  const [collapseTrigger, setCollapseTrigger] = React.useState(0);

  const handleAddRootFile = () => {
    setIsNewFileDialogOpen(true);
  };

  const handleAddRootFolder = () => {
    setIsNewFolderDialogOpen(true);
  };

  const handleCollapseAll = () => {
    setCollapseTrigger((prev) => prev + 1);
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
    <Sidebar className="border-r border-[rgba(0,180,255,0.08)] bg-[#020B1F] shadow-[5px_0_25px_rgba(0,0,0,0.3)]">
      <SidebarContent className="bg-transparent py-4 px-3">
        <SidebarGroup className="p-0">
          <div className="flex items-center justify-between px-3 py-2 mb-4 rounded-xl border border-[rgba(0,180,255,0.08)] bg-[rgba(7,20,40,0.4)] backdrop-blur-md">
            <span className="text-xs font-semibold font-jetbrains uppercase tracking-widest text-[#7ca8cc]">
              {title}
            </span>
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={handleAddRootFile}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-[#00D4FF] hover:text-[#e8f4ff] hover:bg-[#00D4FF]/10 hover:shadow-[0_0_8px_rgba(0,212,255,0.2)] transition-all duration-200 cursor-pointer outline-none border-none"
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
                    className="h-6 w-6 rounded-md flex items-center justify-center text-[#8B5CF6] hover:text-[#e8f4ff] hover:bg-[#8B5CF6]/10 hover:shadow-[0_0_8px_rgba(139,92,246,0.2)] transition-all duration-200 cursor-pointer outline-none border-none"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#071428] border border-[rgba(139,92,246,0.25)] text-[#e8f4ff] font-jetbrains text-xs">New Folder</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={handleCollapseAll}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-[#7ca8cc] hover:text-[#00D4FF] hover:bg-[#00D4FF]/10 hover:shadow-[0_0_8px_rgba(0,212,255,0.2)] transition-all duration-200 cursor-pointer outline-none border-none"
                  >
                    <FolderMinus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#071428] border border-[rgba(0,180,255,0.25)] text-[#e8f4ff] font-jetbrains text-xs">Collapse All Folders</TooltipContent>
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
  onFileSelect?: (file: TemplateFile) => void;
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

    const isSelected =
      selectedFile &&
      selectedFile.filename === file.filename &&
      selectedFile.fileExtension === file.fileExtension;

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

    // Helper to map extensions to glowing colors
    const getFileIconColor = (ext: string) => {
      switch (ext.toLowerCase()) {
        case "json":
        case "lock":
          return "text-amber-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]";
        case "js":
        case "jsx":
          return "text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.5)]";
        case "ts":
        case "tsx":
          return "text-sky-400 drop-shadow-[0_0_4px_rgba(56,189,248,0.5)]";
        case "css":
          return "text-blue-400 drop-shadow-[0_0_4px_rgba(96,165,250,0.5)]";
        case "html":
          return "text-orange-400 drop-shadow-[0_0_4px_rgba(251,146,60,0.5)]";
        default:
          return "text-[#00D4FF] drop-shadow-[0_0_4px_rgba(0,212,255,0.5)]";
      }
    };

    return (
      <SidebarMenuItem className="relative group/item">
        <SidebarMenuButton
          isActive={isSelected}
          onClick={() => onFileSelect?.(file)}
          className={cn(
            "w-full flex items-center px-3 py-2 text-sm rounded-xl transition-all duration-300 cursor-pointer font-jetbrains border outline-none",
            isSelected 
              ? "bg-gradient-to-r from-[rgba(0,212,255,0.15)] to-[rgba(139,92,246,0.15)] text-[#00D4FF] border-l-2 border-l-[#00D4FF] border-y-[rgba(0,212,255,0.2)] border-r-[rgba(0,212,255,0.2)] shadow-[0_0_15px_rgba(0,212,255,0.15)]" 
              : "text-[#7ca8cc] hover:text-white hover:bg-[#00D4FF]/5 hover:shadow-[inset_0_0_8px_rgba(0,212,255,0.05)] border-transparent"
          )}
        >
          <File className={cn("h-4 w-4 mr-2 shrink-0 transition-transform duration-300 group-hover/item:scale-110", getFileIconColor(file.fileExtension))} />
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
                "w-full flex items-center px-3 py-2 text-sm rounded-xl transition-all duration-300 cursor-pointer font-jetbrains border border-transparent text-[#7ca8cc] hover:text-white hover:bg-[#8B5CF6]/5 hover:shadow-[inset_0_0_8px_rgba(139,92,246,0.05)] outline-none"
              )}
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-300 text-[#3a6080] mr-1",
                  isOpen ? "rotate-90 text-[#8B5CF6]" : ""
                )}
              />
              <Folder className={cn(
                "h-4 w-4 mr-2 shrink-0 transition-transform duration-300 group-hover/folder:scale-110",
                isOpen ? "text-[#8B5CF6] drop-shadow-[0_0_4px_rgba(139,92,246,0.5)]" : "text-[#3B82F6] drop-shadow-[0_0_4px_rgba(59,130,246,0.4)]"
              )} />
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
            <SidebarMenuSub className="border-l border-[rgba(0,180,255,0.1)] ml-4 pl-3 space-y-1.5 mt-1">
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

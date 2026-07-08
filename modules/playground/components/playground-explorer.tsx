"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  File,
  Folder,
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
import RenameFileDialog from "./dialogs/rename-file-dialog";
import { DeleteDialog } from "./dialogs/delete-dialog";
import { getFileDisplayName, splitFilename, findSiblingNameConflict } from "@/modules/playground/lib";

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

/**
 * VS Code explorer order: folders before files, alphabetical within each group.
 */
function sortItems(items: TemplateItem[]): TemplateItem[] {
  return [...items].sort((a, b) => {
    const aIsFolder = "folderName" in a;
    const bIsFolder = "folderName" in b;
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;

    const aName = aIsFolder ? (a as TemplateFolder).folderName : (a as TemplateFile).filename;
    const bName = bIsFolder ? (b as TemplateFolder).folderName : (b as TemplateFile).filename;
    return aName.localeCompare(bName, undefined, { sensitivity: "base" });
  });
}

function itemKey(item: TemplateItem): string {
  return "folderName" in item
    ? `folder:${item.folderName}`
    : `file:${getFileDisplayName(item.filename, item.fileExtension)}`;
}

/**
 * Splits a raw tree-input string like "components/Button.tsx" into path segments,
 * rejecting empty input, NUL bytes, and "." / ".." segments. Returns null if invalid.
 */
function parsePathSegments(raw: string): string[] | null {
  if (raw.includes("\0")) return null;
  const segments = raw
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  if (segments.some((s) => s === "." || s === "..")) return null;
  return segments;
}

/**
 * Handles inline-input submission for both "New File" and "New Folder", supporting
 * VS Code-style nested path creation (e.g. "components/Button.tsx" auto-creates
 * the intermediate "components" folder).
 */
function submitInlineCreate(
  kind: "file" | "folder",
  raw: string,
  basePath: string,
  onAddFile?: (file: TemplateFile, parentPath: string) => void,
  onAddFolder?: (folder: TemplateFolder, parentPath: string) => void
) {
  const segments = parsePathSegments(raw);
  if (!segments) return;

  const intermediateFolders = segments.slice(0, -1);
  const name = segments[segments.length - 1];
  const parentPath = [basePath, ...intermediateFolders].filter(Boolean).join("/");

  if (kind === "folder") {
    onAddFolder?.({ folderName: name, items: [] }, parentPath);
  } else {
    const { filename, fileExtension } = splitFilename(name);
    onAddFile?.({ filename, fileExtension, content: "" }, parentPath);
  }
}

interface InlineCreateInputProps {
  kind: "file" | "folder";
  level: number;
  onConfirm: (raw: string) => void;
  onCancel: () => void;
  /** Sibling items already in the target directory, used for a live duplicate-name check. */
  existingItems?: TemplateItem[];
}

function InlineCreateInput({ kind, level, onConfirm, onCancel, existingItems = [] }: InlineCreateInputProps) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const settledRef = React.useRef(false);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    if (settledRef.current) return;
    const trimmed = value.trim();
    if (!trimmed) {
      settledRef.current = true;
      onCancel();
      return;
    }

    // Nested path creation (e.g. "components/Button.tsx") lands in a
    // not-yet-resolved subfolder, so only validate a same-directory
    // duplicate for a plain, non-nested name.
    if (!trimmed.includes("/") && findSiblingNameConflict(existingItems, trimmed)) {
      setError(`A ${kind} named "${trimmed}" already exists in this folder.`);
      return;
    }

    settledRef.current = true;
    onConfirm(trimmed);
  };

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  return (
    <SidebarMenuItem>
      <div
        className="w-full flex items-center py-1.5 h-[22px] relative"
        style={{ paddingLeft: `${12 + level * 12}px`, paddingRight: "12px" }}
      >
        {kind === "folder" ? (
          <Folder className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
        ) : (
          <File className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
        )}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={commit}
          placeholder={kind === "folder" ? "folder name" : "file name"}
          className={cn(
            "flex-1 min-w-0 bg-background border rounded-sm px-1 text-[13px] font-sans text-foreground outline-none",
            error ? "border-destructive" : "border-primary"
          )}
        />
        {error && (
          <div
            className="absolute left-0 top-full mt-0.5 z-20 text-[11px] leading-tight text-destructive bg-popover border border-destructive/40 rounded px-1.5 py-0.5 shadow-sm whitespace-nowrap"
            style={{ marginLeft: `${12 + level * 12}px` }}
          >
            {error}
          </div>
        )}
      </div>
    </SidebarMenuItem>
  );
}

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
  const [creatingRoot, setCreatingRoot] = React.useState<"file" | "folder" | null>(null);
  const [collapseTrigger, setCollapseTrigger] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleAddRootFile = () => {
    setCreatingRoot("file");
  };

  const handleAddRootFolder = () => {
    setCreatingRoot("folder");
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

  const handleConfirmRootCreate = (raw: string) => {
    if (isRootFolder) {
      submitInlineCreate(creatingRoot!, raw, "", onAddFile, onAddFolder);
    }
    setCreatingRoot(null);
  };

  return (
    <Sidebar collapsible="none" className="w-full border-none bg-sidebar">
      <SidebarContent className="bg-transparent py-4 px-3">
        <SidebarGroup className="p-0">
          <div className="group/header flex items-center justify-between px-3 py-2 mb-4">
            <span className="text-[11px] font-medium font-sans truncate text-foreground/80">
              {title}
            </span>
            <div className="flex items-center gap-1.5 opacity-0 group-hover/header:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={handleAddRootFile}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all duration-200 cursor-pointer outline-none border-none"
                  >
                    <FilePlus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-popover border border-border text-popover-foreground font-mono text-xs">New File</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={handleAddRootFolder}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all duration-200 cursor-pointer outline-none border-none"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-popover border border-border text-popover-foreground font-sans text-xs">New Folder</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all duration-200 cursor-pointer outline-none border-none disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-popover border border-border text-popover-foreground font-sans text-xs">Sync from Terminal</TooltipContent>
              </Tooltip>
 
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={handleCollapseAll}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all duration-200 cursor-pointer outline-none border-none"
                  >
                    <FolderMinus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-popover border border-border text-popover-foreground font-sans text-xs">Collapse All Folders</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1.5 pb-20">
              {isRootFolder && creatingRoot && (
                <InlineCreateInput
                  kind={creatingRoot}
                  level={0}
                  onConfirm={handleConfirmRootCreate}
                  onCancel={() => setCreatingRoot(null)}
                  existingItems={(data as TemplateFolder).items}
                />
              )}
              {isRootFolder ? (
                sortItems((data as TemplateFolder).items).map((child) => (
                  <TemplateNode
                    key={itemKey(child)}
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
  const [creating, setCreating] = React.useState<"file" | "folder" | null>(null);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  // Collapsed by default on initial load (VS Code convention); user-driven
  // expand/collapse via setIsOpen below still works normally afterward.
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    if (collapseTrigger > 0 && isFolder) {
      setIsOpen(false);
    }
  }, [collapseTrigger, isFolder]);

  if (!isValidItem) return null;

  if (!isFolder) {
    const file = item as TemplateFile;
    const fileName = getFileDisplayName(file.filename, file.fileExtension);

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
      return selected ? "text-primary" : "text-muted-foreground";
    };
 
    return (
      <SidebarMenuItem className="relative group/item">
        <SidebarMenuButton
          isActive={isSelected}
          onClick={() => onFileSelect?.(file, true)}
          onDoubleClick={() => onFileSelect?.(file, false)}
          style={isSelected ? { textShadow: "0 0 8px var(--primary)" } : undefined}
          className={cn(
            "w-full flex items-center px-3 py-1.5 text-[13px] rounded-none transition-all duration-200 cursor-pointer font-sans outline-none border-none h-[22px]",
            isSelected 
              ? "bg-sidebar-accent text-primary border-l-2 border-l-primary" 
              : "text-foreground/75 hover:text-foreground hover:bg-sidebar-accent/50 bg-transparent"
          )}
        >
          <File className={cn("h-4 w-4 mr-2 shrink-0", getFileIconColor(isSelected))} />
          <span className="truncate flex-1 text-left min-w-0">{fileName}</span>
        </SidebarMenuButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction showOnHover className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 rounded-md transition-all">
              <MoreHorizontal className="h-4 w-4" />
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 bg-popover border border-border text-popover-foreground rounded-xl overflow-hidden shadow-2xl p-1">
            <DropdownMenuItem onClick={handleRename} className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-sidebar-accent cursor-pointer transition-colors focus:bg-sidebar-accent focus:text-foreground">
              <Edit3 className="h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={handleDelete}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-destructive hover:bg-destructive/10 cursor-pointer transition-colors focus:bg-destructive/10 focus:text-destructive"
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
      setIsOpen(true);
      setCreating("file");
    };

    const handleAddFolder = () => {
      setIsOpen(true);
      setCreating("folder");
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

    const handleConfirmCreate = (raw: string) => {
      submitInlineCreate(creating!, raw, currentPath, onAddFile, onAddFolder);
      setCreating(null);
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
                "w-full flex items-center px-3 py-1.5 text-[13px] rounded-none transition-all duration-200 cursor-pointer font-sans text-foreground/75 hover:text-foreground hover:bg-sidebar-accent/50 bg-transparent outline-none border-none h-[22px]"
              )}
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-all duration-200 text-muted-foreground mr-1",
                  isOpen ? "rotate-90" : ""
                )}
              />
              <Folder className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1 text-left min-w-0">{folderName}</span>
            </SidebarMenuButton>
          </CollapsibleTrigger>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction showOnHover className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 rounded-md transition-all">
                <MoreHorizontal className="h-4 w-4" />
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 bg-popover border border-border text-popover-foreground rounded-xl overflow-hidden shadow-2xl p-1">
              <DropdownMenuItem onClick={handleAddFile} className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-sidebar-accent cursor-pointer transition-colors focus:bg-sidebar-accent focus:text-foreground">
                <FilePlus className="h-3.5 w-3.5" />
                New File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAddFolder} className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-sidebar-accent cursor-pointer transition-colors focus:bg-sidebar-accent focus:text-foreground">
                <FolderPlus className="h-3.5 w-3.5" />
                New Folder
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem onClick={handleRename} className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-sidebar-accent cursor-pointer transition-colors focus:bg-sidebar-accent focus:text-foreground">
                <Edit3 className="h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-destructive hover:bg-destructive/10 cursor-pointer transition-colors focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <CollapsibleContent>
            <SidebarMenuSub className="border-l border-border ml-3 pl-2.5 space-y-1 mt-0.5">
              {creating && (
                <InlineCreateInput
                  kind={creating}
                  level={level + 1}
                  onConfirm={handleConfirmCreate}
                  onCancel={() => setCreating(null)}
                  existingItems={folder.items}
                />
              )}
              {sortItems(folder.items).map((childItem) => (
                <TemplateNode
                  key={itemKey(childItem)}
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

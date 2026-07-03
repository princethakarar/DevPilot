interface TemplateItem {
  filename: string;
  fileExtension: string;
  content: string;
  folderName?: string;
  items?: TemplateItem[];
}

interface WebContainerFile {
  file: {
    contents: string;
  };
}

interface WebContainerDirectory {
  directory: {
    [key: string]: WebContainerFile | WebContainerDirectory;
  };
}

type WebContainerFileSystem = Record<string, WebContainerFile | WebContainerDirectory>;

function isDirectoryItem(item: TemplateItem): boolean {
  return !!item.folderName && !!item.items;
}

function itemKey(item: TemplateItem): string {
  if (isDirectoryItem(item)) return item.folderName!;
  return item.fileExtension ? `${item.filename}.${item.fileExtension}` : item.filename;
}

export function transformToWebContainerFormat(template: { folderName: string; items: TemplateItem[] }): WebContainerFileSystem {
  function processItem(item: TemplateItem): WebContainerFile | WebContainerDirectory {
    if (isDirectoryItem(item)) {
      // This is a directory
      const directoryContents: WebContainerFileSystem = {};

      item.items!.forEach(subItem => {
        directoryContents[itemKey(subItem)] = processItem(subItem);
      });

      return {
        directory: directoryContents
      };
    } else {
      // This is a file
      return {
        file: {
          contents: item.content
        }
      };
    }
  }

  const result: WebContainerFileSystem = {};

  template.items.forEach(item => {
    result[itemKey(item)] = processItem(item);
  });

  return result;
}
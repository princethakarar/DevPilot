import type { Monaco } from "@monaco-editor/react";

export const getEditorLanguage = (fileExtension: string): string => {
  const extension = fileExtension.toLowerCase();
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    mjs: "javascript",
    cjs: "javascript",
    
    // Web languages
    json: "json",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "scss",
    less: "less",
    
    // Markup/Documentation
    md: "markdown",
    markdown: "markdown",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    
    // Programming languages
    py: "python",
    python: "python",
    java: "java",
    c: "c",
    cpp: "cpp",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    go: "go",
    rs: "rust",
    sh: "shell",
    bash: "shell",
    sql: "sql",
    
    // Config files
    toml: "ini",
    ini: "ini",
    conf: "ini",
    dockerfile: "dockerfile",
  };
  
  return languageMap[extension] || "plaintext";
};

export const configureMonaco = (monaco: Monaco) => {
  // Define a beautiful modern dark theme
  monaco.editor.defineTheme("modern-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      // Comments
      { token: "comment", foreground: "3D5470", fontStyle: "italic" },
      { token: "comment.line", foreground: "3D5470", fontStyle: "italic" },
      { token: "comment.block", foreground: "3D5470", fontStyle: "italic" },
      
      // Keywords
      { token: "keyword", foreground: "7DD3FC", fontStyle: "bold" },
      { token: "keyword.control", foreground: "7DD3FC", fontStyle: "bold" },
      { token: "keyword.operator", foreground: "D4D4D4" },
      
      // Strings
      { token: "string", foreground: "34D399" },
      { token: "string.quoted", foreground: "34D399" },
      { token: "string.template", foreground: "34D399" },
      
      // Numbers
      { token: "number", foreground: "B5CEA8" },
      { token: "number.hex", foreground: "B5CEA8" },
      { token: "number.float", foreground: "B5CEA8" },
      
      // Functions
      { token: "entity.name.function", foreground: "A78BFA" },
      { token: "support.function", foreground: "A78BFA" },
      
      // Variables
      { token: "variable", foreground: "9CDCFE" },
      { token: "variable.parameter", foreground: "9CDCFE" },
      { token: "variable.other", foreground: "9CDCFE" },
      
      // Types
      { token: "entity.name.type", foreground: "4EC9B0" },
      { token: "support.type", foreground: "4EC9B0" },
      { token: "storage.type", foreground: "569CD6" },
      
      // Classes
      { token: "entity.name.class", foreground: "4EC9B0" },
      { token: "support.class", foreground: "4EC9B0" },
      
      // Constants
      { token: "constant", foreground: "4FC1FF" },
      { token: "constant.language", foreground: "569CD6" },
      { token: "constant.numeric", foreground: "B5CEA8" },
      
      // Operators
      { token: "keyword.operator", foreground: "D4D4D4" },
      { token: "punctuation", foreground: "D4D4D4" },
      
      // HTML/XML
      { token: "tag", foreground: "569CD6" },
      { token: "tag.id", foreground: "9CDCFE" },
      { token: "tag.class", foreground: "92C5F8" },
      { token: "attribute.name", foreground: "9CDCFE" },
      { token: "attribute.value", foreground: "34D399" },
      
      // CSS
      { token: "attribute.name.css", foreground: "9CDCFE" },
      { token: "attribute.value.css", foreground: "34D399" },
      { token: "property-name.css", foreground: "9CDCFE" },
      { token: "property-value.css", foreground: "34D399" },
      
      // JSON
      { token: "key", foreground: "9CDCFE" },
      { token: "string.key", foreground: "9CDCFE" },
      { token: "string.value", foreground: "34D399" },
      
      // Error/Warning
      { token: "invalid", foreground: "F44747", fontStyle: "underline" },
      { token: "invalid.deprecated", foreground: "D4D4D4", fontStyle: "strikethrough" },
    ],
    colors: {
      // Editor background
      "editor.background": "#080C18",
      "editor.foreground": "#E2EAF4",
      
      // Line numbers
      "editorLineNumber.foreground": "#2A3F58",
      "editorLineNumber.activeForeground": "#38BDF8",
      
      // Cursor
      "editorCursor.foreground": "#38BDF8",
      
      // Selection
      "editor.selectionBackground": "#38BDF81F",
      "editor.selectionHighlightBackground": "#38BDF80F",
      "editor.inactiveSelectionBackground": "#38BDF80A",
      
      // Current line
      "editor.lineHighlightBackground": "#38BDF80A",
      "editor.lineHighlightBorder": "#00000000",
      
      // Gutter
      "editorGutter.background": "#080C18",
      "editorGutter.modifiedBackground": "#BB800966",
      "editorGutter.addedBackground": "#347D3966",
      "editorGutter.deletedBackground": "#F8514966",
      
      // Scrollbar
      "scrollbar.shadow": "#00000080",
      "scrollbarSlider.background": "#1E2D4550",
      "scrollbarSlider.hoverBackground": "#2A4A7F80",
      "scrollbarSlider.activeBackground": "#38BDF840",
      
      // Minimap
      "minimap.background": "#080C18",
      "minimap.selectionHighlight": "#38BDF81F",
      
      // Find/Replace
      "editor.findMatchBackground": "#F59E0B59",
      "editor.findMatchHighlightBackground": "#F59E0B26",
      "editor.findRangeHighlightBackground": "#22C55E26",
      
      // Word highlight
      "editor.wordHighlightBackground": "#38BDF814",
      "editor.wordHighlightStrongBackground": "#A78BFA26",
      
      // Brackets
      "editorBracketMatch.background": "#38BDF81A",
      "editorBracketMatch.border": "#38BDF84D",
      
      // Indentation guides
      "editorIndentGuide.background": "#38BDF80A",
      "editorIndentGuide.activeBackground": "#38BDF81A",
      
      // Ruler
      "editorRuler.foreground": "#38BDF80D",
      
      // Whitespace
      "editorWhitespace.foreground": "#38BDF81A",
      
      // Error/Warning squiggles
      "editorError.foreground": "#F85149",
      "editorWarning.foreground": "#D29922",
      "editorInfo.foreground": "#38BDF8",
      "editorHint.foreground": "#EEEEEE",
      
      // Suggest widget
      "editorSuggestWidget.background": "#0D1221",
      "editorSuggestWidget.border": "#1E2D45",
      "editorSuggestWidget.foreground": "#E2EAF4",
      "editorSuggestWidget.selectedBackground": "#1A2236",
      
      // Hover widget
      "editorHoverWidget.background": "#0D1221",
      "editorHoverWidget.border": "#1E2D45",
      
      // Panel
      "panel.background": "#080C18",
      "panel.border": "#1E2D45",
      
      // Activity bar
      "activityBar.background": "#080C18",
      "activityBar.foreground": "#E2EAF4",
      "activityBar.border": "#1E2D45",
      
      // Side bar
      "sideBar.background": "#080C18",
      "sideBar.foreground": "#E2EAF4",
      "sideBar.border": "#1E2D45",
    },
  });

  // Set the theme
  monaco.editor.setTheme("modern-dark");
  
  // Configure additional editor settings
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  // Set compiler options for better IntelliSense
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    reactNamespace: "React",
    allowJs: true,
    typeRoots: ["node_modules/@types"],
  });

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    reactNamespace: "React",
    allowJs: true,
    typeRoots: ["node_modules/@types"],
  });
};

export const defaultEditorOptions = {
  // Font settings
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontLigatures: true,
  fontWeight: "400",
  
  // Layout
  minimap: { 
    enabled: true,
    size: "proportional",
    showSlider: "mouseover"
  },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 16, bottom: 16 },
  
  // Line settings
  lineNumbers: "on",
  lineHeight: 22,
  renderLineHighlight: "all",
  renderWhitespace: "selection",
  
  // Indentation
  tabSize: 2,
  insertSpaces: true,
  detectIndentation: true,
  
  // Word wrapping
  wordWrap: "on",
  wordWrapColumn: 120,
  wrappingIndent: "indent",
  
  // Code folding
  folding: true,
  foldingHighlight: true,
  foldingStrategy: "indentation",
  showFoldingControls: "mouseover",
  
  // Scrolling
  smoothScrolling: true,
  mouseWheelZoom: true,
  fastScrollSensitivity: 5,
  
  // Selection
  multiCursorModifier: "ctrlCmd",
  selectionHighlight: true,
  occurrencesHighlight: true,
  
  // Suggestions
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: "on",
  tabCompletion: "on",
  wordBasedSuggestions: true,
  quickSuggestions: {
    other: true,
    comments: false,
    strings: false
  },
  
  // Formatting
  formatOnPaste: true,
  formatOnType: true,
  
  // Bracket matching
  matchBrackets: "always",
  bracketPairColorization: {
    enabled: true
  },
  
  // Guides
  renderIndentGuides: true,
  highlightActiveIndentGuide: true,
  rulers: [80, 120],
  
  // Performance
  disableLayerHinting: false,
  disableMonospaceOptimizations: false,
  
  // Accessibility
  accessibilitySupport: "auto",
  
  // Cursor
  cursorBlinking: "blink",
  cursorSmoothCaretAnimation: true,
  cursorStyle: "line",
  cursorWidth: 2,
  
  // Find
  find: {
    addExtraSpaceOnTop: false,
    autoFindInSelection: "never",
    seedSearchStringFromSelection: "always"
  },
  
  // Hover
  hover: {
    enabled: true,
    delay: 300,
    sticky: true
  },
  
  // Semantic highlighting
  "semanticHighlighting.enabled": true,
  
  // Sticky scroll
  stickyScroll: {
    enabled: true
  }
};
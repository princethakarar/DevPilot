"use client"

import { useRef, useEffect } from "react"
import Editor, { useMonaco, type Monaco } from "@monaco-editor/react"
import { TemplateFile } from "../lib/path-to-json"
import { configureMonaco, defaultEditorOptions, getEditorLanguage } from "../lib/editor-config"
import { registerInlineCompletionProvider } from "../lib/inline-completion-provider"
import { useAiCompletionSettings } from "../hooks/useAiCompletionSettings"

interface PlaygroundEditorProps {
  activeFile: TemplateFile | undefined
  /** The open file's stable unique id (its path). Passed to Monaco as `path` so
   *  each tab gets its own persistent model — switching tabs swaps models via
   *  `editor.setModel()` instead of overwriting a single shared model's content
   *  via `setValue()`, which is what was wiping/corrupting the undo stack. */
  fileId?: string
  content: string
  onContentChange: (value: string) => void
  highlightCurrentLine: boolean
}

// How long the cursor/content must sit completely still before proactively
// re-checking for a suggestion — separate from the provider's own 250ms
// as-you-type debounce (inline-completion-provider.ts). This exists so a
// suggestion still appears if the user just parks the cursor somewhere
// (or the last automatic check happened to return nothing) without typing
// another character — otherwise nothing would ever re-trigger the provider,
// since Monaco only calls it in reaction to real editor events.
const IDLE_RECHECK_MS = 2000

export const PlaygroundEditor = ({
  activeFile,
  fileId,
  content,
  onContentChange,
  highlightCurrentLine,
}: PlaygroundEditorProps) => {
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleDisposablesRef = useRef<{ dispose: () => void }[]>([])

  // Registered once against the shared Monaco namespace (not per editor
  // mount/tab switch — this editor instance and its underlying Monaco models
  // persist across tab switches, see `path` below) and disposed on unmount.
  // Enabled/disabled is checked fresh on every call via the live store state
  // (see inline-completion-provider.ts), not by tearing down and
  // re-registering the provider — that's simpler and avoids any window where
  // a stale registration could still be in flight.
  const monacoInstance = useMonaco()
  useEffect(() => {
    if (!monacoInstance) return
    const { dispose } = registerInlineCompletionProvider(
      monacoInstance,
      () => useAiCompletionSettings.getState().isEnabled
    )
    return () => dispose()
  }, [monacoInstance])

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    editor.updateOptions({
      ...defaultEditorOptions,
      renderLineHighlight: highlightCurrentLine ? "all" : "none",
    })

    configureMonaco(monaco)
    updateEditorLanguage()

    // Idle re-check: (re)arms a timer on every cursor move or edit, and once
    // the cursor has sat still for IDLE_RECHECK_MS, explicitly invokes
    // Monaco's own inline-suggest trigger — same command a manual
    // "show suggestion now" action would use, so it goes through the exact
    // same provider path (and its Explicit-trigger branch skips the extra
    // as-you-type debounce, see inline-completion-provider.ts). Cheap even
    // if the user leaves the tab open and walks away: the provider's own
    // short-lived cache means repeated idle re-checks at the same spot
    // reuse the cached result rather than re-hitting the backend every time.
    const scheduleIdleRecheck = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        if (!useAiCompletionSettings.getState().isEnabled) return
        if (editor.isDisposed?.()) return
        editor.trigger("idle-recheck", "editor.action.inlineSuggest.trigger", {})
      }, IDLE_RECHECK_MS)
    }

    idleDisposablesRef.current.push(editor.onDidChangeCursorPosition(scheduleIdleRecheck))
    idleDisposablesRef.current.push(editor.onDidChangeModelContent(scheduleIdleRecheck))
    scheduleIdleRecheck()
  }

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleDisposablesRef.current.forEach((d) => d.dispose())
      idleDisposablesRef.current = []
    }
  }, [])

  const updateEditorLanguage = () => {
    if (!activeFile || !monacoRef.current || !editorRef.current) return
    const model = editorRef.current.getModel()
    if (!model) return

    const language = getEditorLanguage(activeFile.fileExtension || "")
    try {
      monacoRef.current.editor.setModelLanguage(model, language)
    } catch (error) {
      console.warn("Failed to set editor language:", error)
    }
  }

  useEffect(() => {
    updateEditorLanguage()
  }, [activeFile])

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        renderLineHighlight: highlightCurrentLine ? "all" : "none",
      })
    }
  }, [highlightCurrentLine])

  return (
    <div className="h-full relative">
      <Editor
        height="100%"
        path={fileId}
        value={content}
        onChange={(value) => onContentChange(value || "")}
        onMount={handleEditorDidMount}
        theme="modern-dark"
        language={activeFile ? getEditorLanguage(activeFile.fileExtension || "") : "plaintext"}
        // @ts-ignore
        options={defaultEditorOptions}
      />
    </div>
  )
}

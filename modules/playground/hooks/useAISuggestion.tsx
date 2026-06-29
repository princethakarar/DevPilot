import { useState, useCallback } from "react";
import { toast } from "sonner";

interface AISuggestionsState {
    suggestion: string | null;
    isLoading: boolean;
    position: { line: number; column: number } | null;
    decoration: string[];
    isEnabled: boolean;
}

interface UseAISuggestionsReturn extends AISuggestionsState {
    toggleEnabled: () => void;
    fetchSuggestion: (type: string, editor: any, fileName?: string) => Promise<void>;
    acceptSuggestion: (editor: any, monaco: any) => void;
    rejectSuggestion: (editor: any) => void;
    clearSuggestion: (editor: any) => void;
}

export const useAISuggestions = (): UseAISuggestionsReturn => {
    const [state, setState] = useState<AISuggestionsState>({
        suggestion: null,
        isLoading: false,
        position: null,
        decoration: [],
        isEnabled: true,
    });

    const toggleEnabled = useCallback(() => {
        setState((prev) => ({ ...prev, isEnabled: !prev.isEnabled }))
    }, [])

    const fetchSuggestion = useCallback(
        async (type: string, editor: any, fileName?: string) => {
            setState((currentState) => {
                if (!currentState.isEnabled) {
                    return currentState;
                }

                if (!editor) {
                    return currentState;
                }

                let model = null;
                let cursorPosition = null;
                try {
                    if (
                        typeof editor.getModel === 'function' &&
                        !editor.isDisposed?.()
                    ) {
                        model = editor.getModel();
                        cursorPosition = editor.getPosition();
                    }
                } catch (e) {
                    return currentState;
                }

                if (!model || !cursorPosition) {
                    return currentState;
                }

                const newState = { ...currentState, isLoading: true };

                (async () => {
                    try {
                        // Get filename from model URI or from parameter
                        let fileNameToSend = fileName;
                        if (!fileNameToSend && model.uri) {
                            const path = model.uri.path || model.uri.toString();
                            fileNameToSend = path.split('/').pop() || '';
                        }

                        const payload = {
                            fileContent: model.getValue(),
                            cursorLine: cursorPosition.lineNumber - 1,
                            cursorColumn: cursorPosition.column - 1,
                            suggestionType: type,
                            fileName: fileNameToSend || '',
                        };

                        const response = await fetch("/api/code-completion", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload),
                        });

                        if (!response.ok) {
                            throw new Error(
                                `API responded with status ${response.status}`
                            );
                        }

                        const data = await response.json();

                        if (data.suggestion && data.suggestion.trim() !== '') {
                            const suggestionText = data.suggestion.trim();

                            // Skip empty or very short suggestions
                            if (suggestionText.length < 2) {
                                setState((prev) => ({
                                    ...prev,
                                    isLoading: false,
                                }));
                                return;
                            }

                            setState((prev) => ({
                                ...prev,
                                suggestion: suggestionText,
                                position: {
                                    line: cursorPosition.lineNumber,
                                    column: cursorPosition.column,
                                },
                                isLoading: false,
                            }));
                        } else {
                            setState((prev) => ({ ...prev, isLoading: false }));
                        }
                    } catch (error: any) {
                        console.error("Error fetching code suggestion:", error);
                        toast.error(error.message || "Failed to fetch AI suggestion");
                        setState((prev) => ({ ...prev, isLoading: false }));
                    }
                })();

                return newState;
            });
        },
        []
    );

    const acceptSuggestion = useCallback((editor: any, monaco: any) => {
        setState((currentState) => {
            if (
                !currentState.suggestion ||
                !currentState.position ||
                !editor ||
                !monaco
            ) {
                return currentState;
            }

            if (editor && currentState.decoration.length > 0) {
                editor.deltaDecorations(currentState.decoration, []);
            }

            return {
                ...currentState,
                suggestion: null,
                position: null,
                decoration: [],
            };
        });
    }, []);

    const rejectSuggestion = useCallback((editor: any) => {
        setState((currentState) => {
            if (
                editor &&
                typeof editor.deltaDecorations === 'function' &&
                !editor.isDisposed?.() &&
                currentState.decoration.length > 0
            ) {
                try {
                    editor.deltaDecorations(currentState.decoration, []);
                } catch (e) {
                    console.warn("Failed to clear delta decorations:", e);
                }
            }

            return {
                ...currentState,
                suggestion: null,
                position: null,
                decoration: [],
            };
        });
    }, []);

    const clearSuggestion = useCallback((editor: any) => {
        setState((currentState) => {
            if (
                editor &&
                typeof editor.deltaDecorations === 'function' &&
                !editor.isDisposed?.() &&
                currentState.decoration.length > 0
            ) {
                try {
                    editor.deltaDecorations(currentState.decoration, []);
                } catch (e) {
                    console.warn("Failed to clear decorations:", e);
                }
            }
            return {
                ...currentState,
                suggestion: null,
                position: null,
                decoration: [],
            };
        });
    }, []);

    return {
        ...state,
        toggleEnabled,
        fetchSuggestion,
        acceptSuggestion,
        rejectSuggestion,
        clearSuggestion,
    };
};
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useEffect, useRef, useState, memo } from "react";
import "./Editor.scss";

interface EditorProps {
  transcriptionText: string;
  modelTurnText: string;
  transcriptionResults: string;
  onClear: () => void;
  onTextChange?: (text: string) => void;
}

function EditorComponent({
  transcriptionText,
  modelTurnText,
  transcriptionResults,
  onClear,
  onTextChange,
}: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [editorText, setEditorText] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const prevTranscriptionTextRef = useRef<string>("");
  const prevModelTurnTextRef = useRef<string>("");
  const prevTranscriptionResultsRef = useRef<string>("");

  // This effect handles the insertion of new transcription text.
  useEffect(() => {
    if (isTyping || !textareaRef.current) {
      return;
    }

    const textarea = textareaRef.current;
    let { selectionStart, selectionEnd } = textarea;

    let textToInsert = "";
    let replaceFrom = -1;
    let replaceTo = -1;

    const lastModelTurnText = prevModelTurnTextRef.current;

    // Determine if a turn has just completed. This is the most complex case.
    const turnCompleted =
      modelTurnText.length === 0 &&
      lastModelTurnText.length > 0 &&
      transcriptionResults.length > prevTranscriptionResultsRef.current.length;

    if (turnCompleted) {
      // Case 3: Turn completed. Replace the previous model turn text with the new final text.
      const lastOccurrenceIndex = editorText.lastIndexOf(lastModelTurnText);

      if (lastOccurrenceIndex !== -1) {
        // Find the new final text chunk.
        const newFinalText = transcriptionResults.substring(
          prevTranscriptionResultsRef.current.length
        ).trim();

        textToInsert = newFinalText;
        replaceFrom = lastOccurrenceIndex;
        replaceTo = lastOccurrenceIndex + lastModelTurnText.length;
      }
    } else if (modelTurnText.length > lastModelTurnText.length) {
      // Case 2: New model turn text, replaces live transcription.
      textToInsert = modelTurnText.substring(lastModelTurnText.length); // Insert only the new portion
      const lastLiveText = prevTranscriptionTextRef.current;
      
      if (lastLiveText.length > 0) {
        // Find and replace the live transcription text
        const lastOccurrenceIndex = editorText.lastIndexOf(lastLiveText);
        if (lastOccurrenceIndex !== -1) {
          replaceFrom = lastOccurrenceIndex;
          replaceTo = lastOccurrenceIndex + lastLiveText.length;
        } else {
          // If we can't find the live text, just insert at cursor
          replaceFrom = selectionStart;
          replaceTo = selectionEnd;
        }
      } else {
        // No live text to replace, just insert at cursor
        replaceFrom = selectionStart;
        replaceTo = selectionEnd;
      }
    } else if (
      transcriptionText.length < prevTranscriptionTextRef.current.length
    ) {
      // Case 2b: Live transcription was cleared (transcriptionText became shorter/empty)
      // This happens when model turn arrives and clears the live transcription
      const clearedLiveText = prevTranscriptionTextRef.current;
      if (clearedLiveText.length > 0) {
        const lastOccurrenceIndex = editorText.lastIndexOf(clearedLiveText);
        if (lastOccurrenceIndex !== -1) {
          // Remove the cleared live transcription
          textToInsert = "";
          replaceFrom = lastOccurrenceIndex;
          replaceTo = lastOccurrenceIndex + clearedLiveText.length;
        }
      }
    } else if (
      transcriptionText.length > prevTranscriptionTextRef.current.length
    ) {
      // Case 1: New live transcription. Append at the cursor.
      textToInsert = transcriptionText.substring(
        prevTranscriptionTextRef.current.length
      );
      replaceFrom = selectionStart;
      replaceTo = selectionEnd;
    }

    if (replaceFrom !== -1) {
      // Add a space before the inserted text if it follows punctuation.
      if (
        replaceFrom > 0 &&
        textToInsert.length > 0 &&
        !/^\s/.test(textToInsert)
      ) {
        const charBefore = editorText.substring(replaceFrom - 1, replaceFrom);
        const punctuation = ['.', ',', ';', ':', '?', '!'];
        if (punctuation.includes(charBefore)) {
          textToInsert = ' ' + textToInsert;
        }
      }

      const newEditorText =
        editorText.substring(0, replaceFrom) +
        textToInsert +
        editorText.substring(replaceTo);

      setEditorText(newEditorText);
      onTextChange?.(newEditorText);

      const newCursorPosition = replaceFrom + textToInsert.length;
      setTimeout(() => {
        textarea.selectionStart = newCursorPosition;
        textarea.selectionEnd = newCursorPosition;
        textarea.scrollTop = textarea.scrollHeight;
      }, 0);
    }

    // Update refs for the next render.
    prevTranscriptionTextRef.current = transcriptionText;
    prevModelTurnTextRef.current = modelTurnText;
    prevTranscriptionResultsRef.current = transcriptionResults;
  }, [
    transcriptionText,
    modelTurnText,
    transcriptionResults,
    isTyping,
    editorText,
    onTextChange,
  ]);

  // Auto-scroll to bottom when new text is added and not editing
  useEffect(() => {
    if (textareaRef.current && !isEditing) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [editorText, isEditing]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setEditorText(newText);
    onTextChange?.(newText);

    // User is typing, so pause transcription insertion
    setIsTyping(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1000); // 1-second timeout to resume transcription
  };

  const handleFocus = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  const handleClear = () => {
    setEditorText("");
    onClear();
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(editorText);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDownloadText = () => {
    const blob = new Blob([editorText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcricao-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatus = () => {
    if (modelTurnText) {
      return { text: "Refinando transcrição...", color: "#FF9800" }; // Orange - Processing
    }
    if (transcriptionText) {
      // if (transcriptionResults) {
      //   return { text: "Transcrevendo...", color: "#9C27B0" }; // Purple - Combined state
      // } else {
        return { text: "Transcrevendo...", color: "#2196F3" }; // Blue - Live transcription
      // }
    }
    if (transcriptionResults) {
      return { text: "Transcrição finalizada", color: "#4CAF50" }; // Green - Finalized
    }
    return { text: "Aguardando áudio...", color: "#9E9E9E" }; // Gray - Waiting
  };

  const status = getStatus();

  return (
    <div className="editor-container">
      <div className="editor-header">
        <div className="editor-controls">
          <button 
            onClick={handleCopyToClipboard}
            className="editor-button"
            disabled={!editorText}
            title="Copiar texto"
          >
            📋
          </button>
          <button 
            onClick={handleDownloadText}
            className="editor-button"
            disabled={!editorText}
            title="Baixar texto"
          >
            💾
          </button>
          <button 
            onClick={handleClear}
            className="editor-button clear-button"
            title="Limpar texto"
          >
            🗑️
          </button>
        </div>
      </div>
      
      <textarea
        ref={textareaRef}
        className="editor-textarea"
        value={editorText}
        onChange={handleTextChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="A transcrição aparecerá aqui conforme você fala..."
        spellCheck={false}
      />
      
      <div className="editor-footer">
        <div className="editor-status">
          <div
            className="status-indicator"
            style={{ backgroundColor: status.color }}
          />
          <span className="status-text">{status.text}</span>
        </div>
        <div className="editor-text-metrics">
          <span className="character-count">
            {editorText.length} caracteres
          </span>
          <span className="word-count">
            {editorText.trim() ? editorText.trim().split(/\s+/).length : 0} palavras
          </span>
        </div>
      </div>
    </div>
  );
}

export const Editor = memo(EditorComponent); 
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
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import cn from "classnames";

interface EditorProps {
  transcriptionText: string;
  modelTurnText: string;
  transcriptionResults: string;
  onClear: () => void;
  onTextChange?: (text: string) => void;
  showPreview?: boolean;
  onTogglePreview?: () => void;
}

// Markdown toolbar component
const MarkdownToolbar = ({ onFormatText }: { onFormatText: (format: string) => void }) => {
  const buttons = [
    { label: "B", title: "Bold", format: "bold" },
    { label: "I", title: "Italic", format: "italic" },
    { label: "H1", title: "Heading 1", format: "h1" },
    { label: "H2", title: "Heading 2", format: "h2" },
    { label: "H3", title: "Heading 3", format: "h3" },
    { label: "•", title: "Bullet List", format: "ul" },
    // { label: "1.", title: "Numbered List", format: "ol" },
    // { label: "[]", title: "Checkbox", format: "checkbox" },
    { label: "\"", title: "Quote", format: "quote" },
    { label: "</>", title: "Code", format: "code" },
    { label: "```", title: "Code Block", format: "codeblock" },
    { label: "---", title: "Horizontal Rule", format: "hr" },
    { label: "🔗", title: "Link", format: "link" },
    { label: "📷", title: "Image", format: "image" },
    // { label: "📋", title: "Table", format: "table" },
  ];

  return (
    <div className="markdown-toolbar">
      {buttons.map((button) => (
        <button
          key={button.format}
          className="markdown-button"
          onClick={() => onFormatText(button.format)}
          title={button.title}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
};

function EditorComponent({
  transcriptionText,
  modelTurnText,
  transcriptionResults,
  onClear,
  onTextChange,
  showPreview = true,
  onTogglePreview,
}: EditorProps) {
  const { connected, connect, disconnect } = useLiveAPIContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [editorText, setEditorText] = useState<string>("# Laudo de Radiologia\n\n");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const prevTranscriptionTextRef = useRef<string>("");
  const prevModelTurnTextRef = useRef<string>("");
  const prevTranscriptionResultsRef = useRef<string>("");

  // Markdown formatting functions
  const formatText = (format: string) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const { selectionStart, selectionEnd, value } = textarea;
    const selectedText = value.substring(selectionStart, selectionEnd);
    
    let newText = "";
    let cursorOffset = 0;
    
    switch (format) {
      case "bold":
        newText = `**${selectedText || "bold text"}**`;
        cursorOffset = selectedText ? newText.length : 2;
        break;
      case "italic":
        newText = `*${selectedText || "italic text"}*`;
        cursorOffset = selectedText ? newText.length : 1;
        break;
      case "h1":
        newText = `# ${selectedText || "Heading 1"}`;
        cursorOffset = selectedText ? newText.length : 2;
        break;
      case "h2":
        newText = `## ${selectedText || "Heading 2"}`;
        cursorOffset = selectedText ? newText.length : 3;
        break;
      case "h3":
        newText = `### ${selectedText || "Heading 3"}`;
        cursorOffset = selectedText ? newText.length : 4;
        break;
      case "ul":
        newText = `- ${selectedText || "List item"}`;
        cursorOffset = selectedText ? newText.length : 2;
        break;
      case "ol":
        newText = `1. ${selectedText || "List item"}`;
        cursorOffset = selectedText ? newText.length : 3;
        break;
      case "checkbox":
        newText = `- [ ] ${selectedText || "Task"}`;
        cursorOffset = selectedText ? newText.length : 6;
        break;
      case "quote":
        newText = `> ${selectedText || "Quote"}`;
        cursorOffset = selectedText ? newText.length : 2;
        break;
      case "code":
        newText = `\`${selectedText || "code"}\``;
        cursorOffset = selectedText ? newText.length : 1;
        break;
      case "codeblock":
        newText = `\`\`\`\n${selectedText || "code"}\n\`\`\``;
        cursorOffset = selectedText ? newText.length : 4;
        break;
      case "hr":
        newText = "\n---\n";
        cursorOffset = newText.length;
        break;
      case "link":
        newText = `[${selectedText || "link text"}](url)`;
        cursorOffset = selectedText ? newText.length - 4 : newText.length - 4;
        break;
      case "image":
        newText = `![${selectedText || "alt text"}](image-url)`;
        cursorOffset = selectedText ? newText.length - 12 : newText.length - 12;
        break;
      case "table":
        newText = `| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |`;
        cursorOffset = newText.length;
        break;
      default:
        return;
    }
    
    const newValue = value.substring(0, selectionStart) + newText + value.substring(selectionEnd);
    setEditorText(newValue);
    onTextChange?.(newValue);
    
    // Update cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        selectionStart + cursorOffset,
        selectionStart + cursorOffset
      );
    }, 0);
  };

  // This effect handles the insertion of new transcription text.
  useEffect(() => {
    if (isTyping || !textareaRef.current) {
      return;
    }

    const textarea = textareaRef.current;
    const { selectionStart, selectionEnd } = textarea;
    const isCursorAtEnd =
      selectionStart === selectionEnd && selectionStart === textarea.value.length;

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
        if (isCursorAtEnd) {
          textarea.scrollTop = textarea.scrollHeight;
        }
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
      return { text: "Refinando transcrição...", color: "#2196F3" }; // Blue - Processing
    }
    if (transcriptionText) {
      return { text: "Transcrevendo...", color: "#DC2626" }; // Red - Live transcription
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
          <div className="editor-controls-left">
            <button
              onClick={connected ? disconnect : connect}
              className={cn("stop-button", "connect-toggle", { connected })}
              title={connected ? "Parar ditado" : "Iniciar ditado"}
            >
              <span className="material-symbols-outlined filled">
                {connected ? "fiber_manual_record" : "fiber_manual_record"}
              </span>
            </button>
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
          {onTogglePreview && (
            <button 
              onClick={onTogglePreview}
              className={cn("editor-button", { active: showPreview })}
              title={showPreview ? "Ocultar preview" : "Mostrar preview"}
            >
              👁️
            </button>
          )}
        </div>
      </div>
      
      <MarkdownToolbar onFormatText={formatText} />
      
      <textarea
        ref={textareaRef}
        className="editor-textarea"
        value={editorText}
        onChange={handleTextChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="A transcrição aparecerá aqui conforme você dita..."
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
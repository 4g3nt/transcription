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

  // Determine what text to display: combine accumulated results with current live transcription
  const currentTurnText = transcriptionText 
    ? (modelTurnText + (modelTurnText ? " " : "") + transcriptionText).trim()
    : modelTurnText;
  
  let displayText = "";
  if (transcriptionResults && currentTurnText) {
    // Show both accumulated results and current turn
    displayText = transcriptionResults + "\n\n" + currentTurnText;
  } else if (transcriptionResults) {
    // Only accumulated results
    displayText = transcriptionResults;
  } else if (currentTurnText) {
    // Only current turn
    displayText = currentTurnText;
  }

  // Apply Portuguese medical transcription formatting
  const formattedText = displayText
    .replaceAll(".", ". ")
    .replaceAll("ponto", ". ")
    .replaceAll("vírgula", ", ")
    .replaceAll(", ,", ", ")
    .replaceAll(".parágrafo", ".\n\n")
    .replaceAll(". parágrafo", ".\n\n")
    .replaceAll("parágrafo", "\n\n")
    .replaceAll(", .", ".")
    .replaceAll("paragrafo", "\n\n")
    .replaceAll("?", "? ")
    .replaceAll("!", "! ")
    .replaceAll("  ", " ")
    .trim();

  // Update editor text when transcription changes (only if not actively editing)
  useEffect(() => {
    if (!isEditing && formattedText !== editorText) {
      setEditorText(formattedText);
    }
  }, [formattedText, isEditing, editorText]);

  // Auto-scroll to bottom when new text is added
  useEffect(() => {
    if (textareaRef.current && !isEditing) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [editorText, isEditing]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setEditorText(newText);
    onTextChange?.(newText);
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

  const getStatusText = () => {
    if (transcriptionResults && currentTurnText) {
      return "Transcrições Acumuladas + Atual";
    } else if (transcriptionResults) {
      return "Transcrições Finalizadas";
    } else if (transcriptionText) {
      return "Transcrevendo...";
    } else if (modelTurnText) {
      return "Processando...";
    } else {
      return "Aguardando áudio...";
    }
  };

  const getStatusColor = () => {
    if (transcriptionResults && currentTurnText) {
      return "#9C27B0"; // Purple - Combined state
    } else if (transcriptionResults) {
      return "#4CAF50"; // Green - Finalized
    } else if (transcriptionText) {
      return "#2196F3"; // Blue - Live transcription
    } else if (modelTurnText) {
      return "#FF9800"; // Orange - Processing
    } else {
      return "#9E9E9E"; // Gray - Waiting
    }
  };

  return (
    <div className="editor-container">
      <div className="editor-header">
        <div className="editor-status">
          <div 
            className="status-indicator"
            style={{ backgroundColor: getStatusColor() }}
          />
          <span className="status-text">{getStatusText()}</span>
        </div>
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
        <span className="character-count">
          {editorText.length} caracteres
        </span>
        <span className="word-count">
          {editorText.trim() ? editorText.trim().split(/\s+/).length : 0} palavras
        </span>
      </div>
    </div>
  );
}

export const Editor = memo(EditorComponent); 
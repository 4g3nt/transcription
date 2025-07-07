import React, { useState, useEffect, useRef } from 'react';
import './Editor.scss';

interface EditorProps {
  transcriptionText: string;
  onTextChange?: (text: string) => void;
  onClear?: () => void;
}

const Editor: React.FC<EditorProps> = ({ 
  transcriptionText, 
  onTextChange, 
  onClear 
}) => {
  const [editorText, setEditorText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update editor text when transcription changes, but only if not actively editing
  useEffect(() => {
    if (!isEditing && transcriptionText) {
      setEditorText(transcriptionText);
      // Auto-scroll to bottom
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [transcriptionText, isEditing]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setEditorText(newText);
    onTextChange?.(newText);
  };

  const handleFocus = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    // Delay to allow for quick refocusing
    setTimeout(() => setIsEditing(false), 200);
  };

  const handleClear = () => {
    setEditorText('');
    onClear?.();
    setIsEditing(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editorText);
  };

  const handleDownload = () => {
    const blob = new Blob([editorText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="editor-container">
      <div className="editor-header">
        <h3 className="editor-title">
          {isEditing ? 'Editando Transcrição' : 'Transcrição em Tempo Real'}
        </h3>
        <div className="editor-actions">
          <button 
            className="editor-btn copy-btn"
            onClick={handleCopy}
            title="Copiar texto"
          >
            📋
          </button>
          <button 
            className="editor-btn download-btn"
            onClick={handleDownload}
            title="Baixar como .md"
          >
            💾
          </button>
          <button 
            className="editor-btn clear-btn"
            onClick={handleClear}
            title="Limpar texto"
          >
            🗑️
          </button>
        </div>
      </div>
      
      <div className="editor-content">
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          value={editorText}
          onChange={handleTextChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="A transcrição aparecerá aqui em tempo real..."
          spellCheck={false}
        />
      </div>
      
      <div className="editor-footer">
        <span className="editor-status">
          {editorText.length} caracteres | {editorText.split('\n').length} linhas
        </span>
        <span className="editor-hint">
          {isEditing ? 'Editando manualmente' : 'Recebendo transcrição...'}
        </span>
      </div>
    </div>
  );
};

export default Editor; 
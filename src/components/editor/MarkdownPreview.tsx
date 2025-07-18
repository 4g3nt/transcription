import React from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./MarkdownPreview.scss";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, className = "" }) => {
  return (
    <div className={`markdown-preview ${className}`}>
      <div className="preview-header">
        <span>Pré-visualização</span>
      </div>
      <div className="preview-content">
        <ReactMarkdown
          components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const isCodeBlock = match && String(children).includes('\n');
              return isCodeBlock ? (
                <SyntaxHighlighter
                  style={tomorrow as any}
                  language={match[1]}
                  PreTag="div"
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
          }}
        >
          {content && content.length > 0 ? content : undefined}
        </ReactMarkdown>
        {(!content || content.length === 0) && (
          <div style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            Nada para mostrar ainda
          </div>
        )}
      </div>
    </div>
  );
}; 
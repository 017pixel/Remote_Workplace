import { useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Marked } from "marked";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdownLanguage from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { WarningIcon } from "../icons";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdownLanguage);
hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Eigene Instanz statt `marked.use`: die globale Instanz wird auch von der
// Dateivorschau genutzt und soll ihre Einstellungen behalten.
const markdown = new Marked({
  renderer: {
    code({ text, lang }) {
      const language = lang?.split(/\s+/)[0] ?? "";
      const body = language && hljs.getLanguage(language) ? hljs.highlight(text, { language }).value : escapeHtml(text);
      return `<pre><code class="hljs language-${escapeHtml(language)}">${body}</code></pre>`;
    },
  },
});

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  warnings: string[];
  disabled?: boolean;
}

export function MarkdownEditor({ value, onChange, onBlur, warnings, disabled = false }: MarkdownEditorProps) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const html = useMemo(
    () => (mode === "preview" ? DOMPurify.sanitize(markdown.parse(value, { async: false }) as string, { ADD_ATTR: ["target"] }) : ""),
    [mode, value],
  );

  return (
    <div className="skill-editor-body">
      <div className="skill-editor-modes" role="tablist" aria-label="Ansicht">
        {(["edit", "preview"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            className={mode === option ? "is-active" : ""}
            onClick={() => setMode(option)}
          >
            {option === "edit" ? "Bearbeiten" : "Vorschau"}
          </button>
        ))}
      </div>

      {warnings.length > 0 ? (
        <div className="skill-editor-warnings" role="status">
          <WarningIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      ) : null}

      {mode === "edit" ? (
        <textarea
          ref={areaRef}
          className="skill-editor-textarea"
          value={value}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          disabled={disabled}
          aria-label="Inhalt bearbeiten"
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      ) : (
        <div className="skill-editor-preview file-preview-markdown">
          <article dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );
}

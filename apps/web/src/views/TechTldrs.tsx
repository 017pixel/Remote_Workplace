import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  NewsCategory,
  NewsChatModel,
  NewsCitation,
  NewsCollection,
  NewsItem,
  NewsListResponse,
} from "@workbench/contracts";
import { newsChatModelOptions } from "@workbench/contracts";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Filter,
  Library,
  Newspaper,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { workbenchQueries } from "../lib/queryOptions";
import { useMediaQuery } from "../lib/useMediaQuery";
import { writeClipboardText } from "../lib/clipboard";
import { ConfirmDialog, ModalFrame } from "../components/ModalDialog";

const COMPACT_QUERY = "(max-width: 1180px)";
const MODEL_STORAGE_KEY = "workbench.news.chatModel";

function useTypewriter(text: string, durationMs = 1200) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
  }, [text]);
  useEffect(() => {
    if (count >= text.length) return;
    const step = Math.max(2, Math.round(text.length / (durationMs / 16)));
    const timer = window.setTimeout(
      () => setCount((current) => Math.min(text.length, current + step)),
      16,
    );
    return () => window.clearTimeout(timer);
  }, [count, text, durationMs]);
  return text.slice(0, count);
}

function StreamingMarkdown({
  text,
  citations,
  onOpen,
}: {
  text: string;
  citations: NewsCitation[];
  onOpen: (citation: NewsCitation) => void;
}) {
  const shown = useTypewriter(text);
  const streaming = shown.length < text.length;
  return (
    <div className={`news-stream ${streaming ? "is-streaming" : ""}`}>
      <NewsMarkdown text={shown} citations={citations} onOpen={onOpen} />
      {streaming ? <span className="news-stream-caret" aria-hidden /> : null}
    </div>
  );
}

/* Zahlen springen nicht, sie zählen hoch — sonst wirkt jedes Nachladen wie ein Ruckler. */
function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const currentRef = useRef(value);
  useEffect(() => {
    const from = currentRef.current;
    if (from === value) return;
    if (Math.abs(value - from) <= 1) {
      currentRef.current = value;
      setShown(value);
      return;
    }
    const started = performance.now();
    const duration = 620;
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (value - from) * eased);
      currentRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
      else currentRef.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className="news-counter">{shown.toLocaleString("de-DE")}</span>;
}

const categories: { id: NewsCategory | "all"; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "ai-models", label: "Neue KI-Modelle" },
  { id: "benchmarks", label: "Benchmarks" },
  { id: "developer-tools", label: "Developer Tools" },
  { id: "open-source", label: "Open Source" },
  { id: "security", label: "Security" },
  { id: "tech-policy", label: "Tech-Politik" },
  { id: "infrastructure", label: "Infrastruktur" },
  { id: "research", label: "Forschung" },
  { id: "startups", label: "Startups" },
  { id: "general", label: "Weitere" },
];
const categoryLabel = (id: NewsCategory) =>
  categories.find((item) => item.id === id)?.label ?? id;
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
const excerpt = (text: string, max = 280) =>
  text.length > max ? `${text.slice(0, max).trim()}…` : text;
const importanceLabel = (item: NewsItem) =>
  item.importanceBand === "top"
    ? "Top"
    : item.importanceBand === "important"
      ? "Wichtig"
      : item.importanceBand === "relevant"
        ? "Relevant"
        : "Weitere";
const readerFollowUps = [
  "Was bedeutet das konkret für Entwickler?",
  "Wie ordnet sich das in den bisherigen Kontext ein?",
  "Was sind die nächsten Schritte?",
];
const globalSuggestions = [
  "Was waren diese Woche die wichtigsten Modell-Releases?",
  "Welche Security-News sollte ich kennen?",
  "Fasse die drei wichtigsten Nachrichten von heute zusammen.",
  "Was hat sich bei Benchmarks zuletzt verschoben?",
];

function Cover({ item, large = false }: { item: NewsItem; large?: boolean }) {
  return (
    <div
      className={`news-cover ${large ? "is-large" : ""} category-${item.category}`}
    >
      <div className="news-cover-fallback">
        <span>{categoryLabel(item.category)}</span>
        <strong>{item.source.name}</strong>
      </div>
      {item.coverUrl ? (
        <img
          src={`/api/v1/news/image/${item.id}`}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      {item.mediaType === "video" ? (
        <span className="news-video-mark">
          <Play className="h-4 w-4" /> Video
        </span>
      ) : null}
    </div>
  );
}

type MarkdownNode = React.ReactNode;

function renderInline(text: string, citations: NewsCitation[], onOpen: (citation: NewsCitation) => void): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let key = 0;
  const citationByNumber = new Map<number, NewsCitation>();
  citations.forEach((citation, index) => citationByNumber.set(index + 1, citation));

  const pushText = (value: string) => {
    if (!value) return;
    const parts: MarkdownNode[] = [];
    const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(value)) !== null) {
      if (match.index > last) parts.push(value.slice(last, match.index));
      const bold = match[2];
      const italic = match[3];
      const code = match[4];
      const linkText = match[5];
      const linkHref = match[6];
      if (bold !== undefined) {
        parts.push(<strong key={`b${key++}`}>{bold}</strong>);
      } else if (italic !== undefined) {
        parts.push(<em key={`i${key++}`}>{italic}</em>);
      } else if (code !== undefined) {
        parts.push(<code key={`c${key++}`} className="news-md-code">{code}</code>);
      } else if (linkText !== undefined && linkHref !== undefined) {
        parts.push(
          <a
            key={`a${key++}`}
            href={linkHref}
            target="_blank"
            rel="noreferrer noopener"
            className="news-md-link"
          >
            {linkText}
          </a>,
        );
      }
      last = regex.lastIndex;
    }
    if (last < value.length) parts.push(value.slice(last));
    nodes.push(...parts);
  };

  const segments = text.split(/(\[\d+\])/g);
  for (const segment of segments) {
    const citationMatch = /^\[(\d+)\]$/.exec(segment);
    if (citationMatch) {
      const number = Number(citationMatch[1]);
      const citation = citationByNumber.get(number);
      if (citation) {
        nodes.push(
          <button
            key={`c${key++}`}
            type="button"
            className="news-inline-citation"
            onClick={() => onOpen(citation)}
            title={citation.title}
          >
            {number}
          </button>,
        );
      } else {
        nodes.push(segment);
      }
    } else {
      pushText(segment);
    }
  }
  return nodes;
}

/* Zeilenweiser Block-Parser: Überschriften, Listen und Trenner tauchen im Modelltext auch
   mitten in einem Absatz auf. Ein reiner Absatz-Split hätte "### Titel" wörtlich ausgegeben. */
function NewsMarkdown({
  text,
  citations,
  onOpen,
}: {
  text: string;
  citations: NewsCitation[];
  onOpen: (citation: NewsCitation) => void;
}) {
  const blocks: MarkdownNode[] = [];
  const lines = text.split(/\r?\n/);
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: { language: string; lines: string[] } | null = null;
  let key = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      <p key={`p${key++}`}>{renderInline(paragraph.join(" "), citations, onOpen)}</p>,
    );
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${key++}`} className="news-answer-list">
        {list.map((entry, index) => (
          <li key={index}>{renderInline(entry, citations, onOpen)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const fence = /^```(\w*)$/.exec(line);
    if (code) {
      if (fence || line === "```") {
        blocks.push(
          <pre key={`c${key++}`} className="news-md-pre">
            <code>{code.lines.join("\n")}</code>
          </pre>,
        );
        code = null;
      } else {
        code.lines.push(rawLine);
      }
      continue;
    }
    if (fence) {
      flushAll();
      code = { language: fence[1] ?? "", lines: [] };
      continue;
    }
    if (!line) {
      flushAll();
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})(\s+(-{3,}|\*{3,}|_{3,}))*$/.test(line)) {
      flushAll();
      blocks.push(<hr key={`r${key++}`} className="news-md-rule" />);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushAll();
      const level = Math.min(3, (heading[1] ?? "").length);
      const content = heading[2] ?? "";
      const className = `news-md-h news-md-h${level}`;
      const inline = renderInline(content, citations, onOpen);
      blocks.push(
        level === 1 ? <h4 key={`h${key++}`} className={className}>{inline}</h4>
          : level === 2 ? <h5 key={`h${key++}`} className={className}>{inline}</h5>
            : <h6 key={`h${key++}`} className={className}>{inline}</h6>,
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushAll();
      blocks.push(
        <blockquote key={`q${key++}`} className="news-md-quote">
          {renderInline(line.replace(/^>\s?/, ""), citations, onOpen)}
        </blockquote>,
      );
      continue;
    }
    const bullet = /^([-*+]|\d+\.)\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[2] ?? "");
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  if (code) {
    blocks.push(
      <pre key={`c${key++}`} className="news-md-pre">
        <code>{code.lines.join("\n")}</code>
      </pre>,
    );
  }
  flushAll();
  return <>{blocks}</>;
}

function CopyButton({ text, label = "Antwort kopieren" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className={`news-ghost-action ${copied ? "is-done" : ""}`}
      onClick={() => {
        void writeClipboardText(text).then(() => setCopied(true)).catch(() => setCopied(false));
      }}
      aria-label={label}
    >
      {copied ? <Check /> : <Copy />}
      <span>{copied ? "Kopiert" : "Kopieren"}</span>
    </button>
  );
}

function SavePanel({
  item,
  collections,
  onClose,
  onSaved,
  onDeleteCollection,
}: {
  item: NewsItem;
  collections: NewsCollection[];
  onClose: () => void;
  onSaved?: (item: NewsItem) => void;
  onDeleteCollection: (id: string) => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>(item.collectionIds);
  const save = useMutation({
    mutationFn: () =>
      apiClient.saveNewsItem(item.id, { collectionIds: selected }),
    onSuccess: async (result) => {
      if (result) onSaved?.(result.item);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["news"] }),
        client.invalidateQueries({ queryKey: ["news", "collections"] }),
      ]);
      onClose();
    },
  });
  const create = useMutation({
    mutationFn: () => apiClient.createNewsCollection({ name }),
    onSuccess: async (result) => {
      if (result) {
        setSelected((ids) => [...ids, result.collection.id]);
        setName("");
        await client.invalidateQueries({ queryKey: ["news", "collections"] });
      }
    },
  });
  return (
    <div className="news-save-panel">
      <header>
        <div>
          <small>Sammlungen</small>
          <h3>Für später speichern</h3>
          <p title={item.title}>{excerpt(item.title, 70)}</p>
        </div>
        <button
          className="news-icon-button"
          onClick={onClose}
          aria-label="Schließen"
        >
          <X />
        </button>
      </header>
      <div className="news-collection-list">
        {collections.length === 0 ? (
          <p className="news-collection-hint">
            Noch keine Sammlung vorhanden. Lege unten die erste an.
          </p>
        ) : null}
        {collections.map((collection) => (
          <div key={collection.id} className="news-collection-row">
            <label>
              <input
                type="checkbox"
                checked={selected.includes(collection.id)}
                onChange={() =>
                  setSelected((ids) =>
                    ids.includes(collection.id)
                      ? ids.filter((id) => id !== collection.id)
                      : [...ids, collection.id],
                  )
                }
              />
              <span>
                <strong>{collection.name}</strong>
                <small>{collection.itemCount} Beiträge</small>
              </span>
              <Check />
            </label>
            <CollectionDeleteButton
              collection={collection}
              size="sm"
              onDeleted={() => onDeleteCollection(collection.id)}
            />
          </div>
        ))}
      </div>
      <div className="news-new-collection">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim() && !create.isPending) create.mutate();
          }}
          placeholder="Neue Sammlung"
        />
        <button
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          <Plus /> <span>Anlegen</span>
        </button>
      </div>
      <button
        className="news-primary-button"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        <Bookmark />
        <span>{save.isPending ? "Speichert …" : "Auswahl speichern"}</span>
      </button>
    </div>
  );
}

function CollectionDeleteButton({
  collection,
  onDeleted,
  size = "md",
}: {
  collection: NewsCollection;
  onDeleted?: () => void;
  size?: "sm" | "md";
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`news-collection-delete ${size === "sm" ? "is-sm" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          setConfirmOpen(true);
        }}
        aria-label={`Sammlung „${collection.name}“ löschen`}
        title="Sammlung löschen"
      >
        <Trash2 />
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title={`Sammlung „${collection.name}“ löschen?`}
        description="Die Sammlung wird dauerhaft entfernt. Die enthaltenen Beiträge selbst bleiben in deinem Bestand erhalten."
        confirmLabel="Sammlung löschen"
        danger
        onConfirm={() => onDeleted?.()}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}

type ChatMessage = {
  question: string;
  answer: string;
  citations: NewsCitation[];
};

function ArticleReader({
  item,
  onClose,
  onItemChange,
  collections,
  onOpenCitation,
  onDeleteCollection,
  model,
}: {
  item: NewsItem;
  onClose: () => void;
  onItemChange: (item: NewsItem) => void;
  collections: NewsCollection[];
  onOpenCitation: (citation: NewsCitation) => void;
  onDeleteCollection: (id: string) => void;
  model: NewsChatModel;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [progress, setProgress] = useState(0);
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const chatScroll = useRef<HTMLDivElement>(null);
  const readerSwipe = useRef<{ x: number; y: number } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const ask = useMutation({
    mutationFn: (value: string) =>
      apiClient.chatNews({
        question: value,
        itemId: item.id,
        model,
        history: messages
          .slice(-6)
          .map((message) => ({
            question: message.question,
            answer: message.answer,
          })),
      }),
    onSuccess: (result, value) => {
      if (result)
        setMessages((list) => [
          ...list,
          {
            question: value,
            answer: result.answer,
            citations: result.citations,
          },
        ]);
      setQuestion("");
    },
  });
  useEffect(() => {
    setMessages([]);
    setQuestion("");
  }, [item.id]);
  useEffect(() => {
    void apiClient.markNewsRead(item.id, { read: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [item.id, onClose]);
  useEffect(() => {
    if (!chatOpen) return;
    const timer = window.setTimeout(() => chatInput.current?.focus(), 320);
    return () => window.clearTimeout(timer);
  }, [chatOpen]);
  useEffect(() => {
    const element = chatScroll.current;
    if (element) element.scrollTo({ top: element.scrollHeight });
  }, [messages, ask.isPending]);
  const submit = (value = question) => {
    if (value.trim() && !ask.isPending) ask.mutate(value.trim());
  };
  return (
    <div
      className="news-reader-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article
        className={`news-reader ${chatOpen ? "is-chat-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        onPointerDown={(event) => { if (event.isPrimary && event.clientY <= 84) readerSwipe.current = { x: event.clientX, y: event.clientY }; }}
        onPointerUp={(event) => { const start = readerSwipe.current; readerSwipe.current = null; if (start && event.clientY - start.y >= 96 && Math.abs(event.clientX - start.x) <= 64) onClose(); }}
        onPointerCancel={() => { readerSwipe.current = null; }}
      >
        <div className="news-reader-progress" aria-hidden>
          <i style={{ transform: `scaleX(${progress})` }} />
        </div>
        <div className="news-reader-controls">
          <button
            className={`news-reader-chat-toggle ${chatOpen ? "is-active" : ""}`}
            onClick={() => setChatOpen((value) => !value)}
            aria-label={chatOpen ? "KI-Chat ausblenden" : "KI-Chat öffnen"}
            aria-expanded={chatOpen}
            aria-controls={`news-chat-${item.id}`}
          >
            <Sparkles />
            <span>KI-Chat</span>
          </button>
          <button
            className="news-reader-close news-icon-button"
            onClick={onClose}
            aria-label="Leser schließen"
          >
            <X />
          </button>
        </div>
        <div
          className="news-reader-scroll"
          onScroll={(event) => {
            const element = event.currentTarget;
            const max = element.scrollHeight - element.clientHeight;
            setProgress(
              max > 0 ? Math.min(1, element.scrollTop / max) : 0,
            );
          }}
        >
          <Cover item={item} large />
          <div className="news-reader-body">
            <div className="news-reader-meta">
              <span className={`news-importance is-${item.importanceBand}`}>
                {importanceLabel(item)} · {item.importanceScore}
              </span>
              <span>{categoryLabel(item.category)}</span>
              <span>{item.source.name}</span>
              <span>{formatDate(item.publishedAt)}</span>
            </div>
            <h1>{item.title}</h1>
            <div className="news-reader-actions">
              <button onClick={() => setSaveOpen(true)}>
                <Bookmark className={item.saved ? "is-filled" : ""} />
                {item.saved ? "Gespeichert" : "Speichern"}
              </button>
              <a href={item.url} target="_blank" rel="noreferrer">
                Original <ExternalLink />
              </a>
            </div>
            <section className="news-tldr">
              <small>TLDR</small>
              <p>{item.tldr}</p>
            </section>
            <section className="news-long">
              <h2>Das Wichtigste im Detail</h2>
              {item.longSummary.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </section>
            {item.videoId ? (
              <div className="news-video">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${item.videoId}`}
                  title={item.title}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
                <a href={item.url} target="_blank" rel="noreferrer">
                  Video direkt auf YouTube öffnen <ExternalLink />
                </a>
              </div>
            ) : null}
            <aside className="news-why">
              <small>Warum wichtig?</small>
              <strong>{item.importanceReason}</strong>
              <span>
                Bewertung{" "}
                {item.aiProcessed
                  ? "durch Mistral und Regelwerk"
                  : "durch das Regelwerk"}
              </span>
            </aside>
          </div>
        </div>
        <aside
          id={`news-chat-${item.id}`}
          className="news-chat-panel"
          aria-hidden={!chatOpen}
          inert={!chatOpen}
        >
          <header>
            <Sparkles />
            <div>
              <strong>Artikel-Assistent</strong>
              <small>Kontext: Artikel, Verlauf und verwandte News</small>
            </div>
            <button
              className="news-chat-close"
              onClick={() => setChatOpen(false)}
              aria-label="KI-Chat schließen"
            >
              <X />
            </button>
          </header>
          <div className="news-chat-messages" ref={chatScroll}>
            {messages.length === 0 ? (
              <div className="news-chat-intro">
                <span>Frag zum Beispiel:</span>
                <button
                  onClick={() =>
                    submit("Was ist daran im Vergleich zum bisherigen Stand neu?")
                  }
                >
                  Was ist konkret neu?
                </button>
                <button
                  onClick={() =>
                    submit(
                      "Welche praktischen Auswirkungen hat diese Nachricht für Entwickler?",
                    )
                  }
                >
                  Auswirkung für Entwickler?
                </button>
                <button
                  onClick={() =>
                    submit("Wie ordnet sich das in die anderen aktuellen News ein?")
                  }
                >
                  Einordnung in aktuelle News?
                </button>
              </div>
            ) : (
              messages.map((message, index) => (
                <div key={index} className="news-chat-exchange">
                  <p className="is-question">{message.question}</p>
                  <div className="is-answer">
                    <StreamingMarkdown
                      text={message.answer}
                      citations={message.citations.filter(
                        (citation) => citation.itemId !== item.id,
                      )}
                      onOpen={onOpenCitation}
                    />
                    <div className="news-answer-tools">
                      <CopyButton text={message.answer} />
                    </div>
                  </div>
                  {index === messages.length - 1 && !ask.isPending ? (
                    <div className="news-chat-followups">
                      {readerFollowUps.map((followUp) => (
                        <button key={followUp} onClick={() => submit(followUp)}>
                          {followUp}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
            {ask.isPending ? (
              <div className="news-answer-skeleton">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>
          <div className="news-chat-input">
            <textarea
              ref={chatInput}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Nachfrage stellen …"
            />
            <button
              onClick={() => submit()}
              disabled={!question.trim() || ask.isPending}
              aria-label="Frage senden"
            >
              <Send />
            </button>
          </div>
        </aside>
        {saveOpen ? (
          <SavePanel
            item={item}
            collections={collections}
            onClose={() => setSaveOpen(false)}
            onSaved={onItemChange}
            onDeleteCollection={onDeleteCollection}
          />
        ) : null}
      </article>
    </div>
  );
}

function NewsCard({
  item,
  index,
  onOpen,
  onSave,
}: {
  item: NewsItem;
  index: number;
  onOpen: () => void;
  onSave: () => void;
}) {
  return (
    <article
      className={`news-bento-card size-${index % 7} importance-${item.importanceBand}`}
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <button
        className="news-card-open"
        onClick={onOpen}
        aria-label={`${item.title} öffnen`}
      >
        <Cover item={item} />
        <div className="news-card-body">
          <div className="news-card-meta">
            <span>
              {item.read ? null : <i className="news-unread-dot" />}
              {categoryLabel(item.category)}
            </span>
            <span>{formatDate(item.publishedAt)}</span>
          </div>
          <h2>{item.title}</h2>
          <p>{excerpt(item.tldr, index % 7 === 0 ? 300 : 190)}</p>
          <footer>
            <span className={`news-importance is-${item.importanceBand}`}>
              {importanceLabel(item)} · {item.importanceScore}
            </span>
            <span>{item.source.name}</span>
          </footer>
        </div>
      </button>
      <button
        className={`news-card-save ${item.saved ? "is-saved" : ""}`}
        onClick={onSave}
        aria-label="In Sammlung speichern"
      >
        <Bookmark />
      </button>
    </article>
  );
}

/* Vertikaler Pager im Stil kurzer Video-Feeds: ein Wisch = eine Nachricht.
   Statt nativem Scroll-Snap steuert ein Zeiger-Gestenhandler die Bewegung, weil nur so
   Auslöseschwelle, Gummiband und Ausklingzeit dem gewohnten App-Gefühl entsprechen. */
function MobileStoryFeed({
  items,
  index,
  onIndexChange,
  onOpen,
  onSave,
  onNeedMore,
}: {
  items: NewsItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onOpen: (item: NewsItem) => void;
  onSave: (item: NewsItem) => void;
  onNeedMore: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  indexRef.current = index;
  const gesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    offset: number;
    axis: "" | "x" | "y";
  } | null>(null);
  const settling = useRef(false);
  const dragged = useRef(false);

  const applyOffset = useCallback((offset: number, duration = 0) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transitionDuration = `${duration}ms`;
    track.style.transform = `translate3d(0, ${offset}px, 0)`;
  }, []);

  useEffect(() => {
    applyOffset(0, 0);
  }, [applyOffset, index, items.length]);

  useEffect(() => {
    if (index >= items.length - 4) onNeedMore();
  }, [index, items.length, onNeedMore]);

  const settle = useCallback(
    (direction: -1 | 0 | 1, offset: number, velocity: number) => {
      const height = rootRef.current?.clientHeight ?? 1;
      const target = Math.max(0, Math.min(indexRef.current + direction, items.length - 1));
      const destination = (indexRef.current - target) * height;
      const distance = Math.abs(destination - offset);
      /* Schneller Wisch landet in ~0,2 s, ein zaghaftes Ziehen federt weicher zurück. */
      const duration = Math.round(
        Math.min(430, Math.max(190, distance / Math.max(Math.abs(velocity) * 1.15, 1.05))),
      );
      settling.current = true;
      applyOffset(destination, duration);
      window.setTimeout(() => {
        settling.current = false;
        if (target !== indexRef.current) {
          navigator.vibrate?.(6);
          flushSync(() => onIndexChange(target));
        }
        applyOffset(0, 0);
      }, duration + 16);
    },
    [applyOffset, items.length, onIndexChange],
  );

  const endGesture = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const state = gesture.current;
    gesture.current = null;
    if (!state || state.axis !== "y") return;
    if (rootRef.current?.hasPointerCapture(event.pointerId))
      rootRef.current.releasePointerCapture(event.pointerId);
    /* Bricht der Browser die Geste ab (etwa durch eine eigene Drag-Aktion), federt die Karte zurück. */
    if (cancelled) {
      settle(0, state.offset, 0);
      return;
    }
    const height = rootRef.current?.clientHeight ?? 1;
    const delta = event.clientY - state.startY;
    const velocity = state.velocity;
    /* Entweder deutlich geflogen (≈ 320 px/s) oder mehr als ein Fünftel der Höhe gezogen. */
    const flung = Math.abs(velocity) > 0.32;
    const pulled = Math.abs(delta) > height * 0.2;
    let direction: -1 | 0 | 1 = 0;
    if (flung) direction = velocity < 0 ? 1 : -1;
    else if (pulled) direction = delta < 0 ? 1 : -1;
    if ((direction === 1 && delta > 0) || (direction === -1 && delta < 0)) direction = 0;
    settle(direction, state.offset, velocity);
  };

  const windowStart = Math.max(0, index - 1);
  const visible = items.slice(windowStart, index + 3);

  return (
    <div
      ref={rootRef}
      className="news-mobile-feed"
      onPointerDown={(event) => {
        if (!event.isPrimary || settling.current) return;
        dragged.current = false;
        gesture.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          lastY: event.clientY,
          lastTime: event.timeStamp,
          velocity: 0,
          offset: 0,
          axis: "",
        };
      }}
      onPointerMove={(event) => {
        const state = gesture.current;
        if (!state || state.pointerId !== event.pointerId) return;
        const deltaY = event.clientY - state.startY;
        const deltaX = event.clientX - state.startX;
        if (!state.axis) {
          if (Math.abs(deltaY) < 9 && Math.abs(deltaX) < 9) return;
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            gesture.current = null;
            return;
          }
          state.axis = "y";
          dragged.current = true;
          rootRef.current?.setPointerCapture(event.pointerId);
        }
        const elapsed = Math.max(1, event.timeStamp - state.lastTime);
        /* Gleitender Mittelwert: einzelne zittrige Events sollen die Richtung nicht kippen. */
        state.velocity = state.velocity * 0.7 + ((event.clientY - state.lastY) / elapsed) * 0.3;
        state.lastY = event.clientY;
        state.lastTime = event.timeStamp;
        const height = rootRef.current?.clientHeight ?? 1;
        const atStart = indexRef.current === 0 && deltaY > 0;
        const atEnd = indexRef.current >= items.length - 1 && deltaY < 0;
        state.offset = atStart || atEnd ? deltaY * 0.32 : Math.max(-height, Math.min(height, deltaY));
        applyOffset(state.offset, 0);
      }}
      onPointerUp={endGesture}
      onPointerCancel={(event) => endGesture(event, true)}
      onDragStart={(event) => event.preventDefault()}
      onClickCapture={(event) => {
        if (!dragged.current) return;
        dragged.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div ref={trackRef} className="news-pager-track">
        {visible.map((item, position) => {
          const slot = windowStart + position - index;
          return (
            <article
              key={item.id}
              className={`news-story ${slot === 0 ? "is-active" : ""}`}
              data-news-id={item.id}
              style={{ transform: `translate3d(0, ${slot * 100}%, 0)` }}
              aria-hidden={slot !== 0}
              inert={slot !== 0}
            >
              <Cover item={item} large />
              <div className="news-story-scrim" />
              <div className="news-story-copy">
                <div>
                  <span className={`news-importance is-${item.importanceBand}`}>
                    {importanceLabel(item)} · {item.importanceScore}
                  </span>
                  <span>{categoryLabel(item.category)}</span>
                  <span>{item.source.name}</span>
                </div>
                <h2>{item.title}</h2>
                <p>{excerpt(item.tldr, 320)}</p>
                <footer>
                  <button onClick={() => onOpen(item)}>Lesen</button>
                  <button onClick={() => onSave(item)} aria-label="Speichern">
                    <Bookmark className={item.saved ? "is-filled" : ""} />
                  </button>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Original öffnen"
                  >
                    <ExternalLink />
                  </a>
                </footer>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

type AiExchange = {
  id: string;
  question: string;
  answer: string | null;
  citations: NewsCitation[];
  model: string | null;
  error: string | null;
};

const citationHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/* Auf dem Handy ist für die hohen Quellenkarten kein Platz: Dort steht je Quelle
   nur eine Pille mit Ziffer und Domain — die Ziffer entspricht der Markierung im
   Antworttext. Alles Weitere zeigt das Pop-up hinter der Pille. */
function SourcePills({
  citations,
  onOpen,
}: {
  citations: NewsCitation[];
  onOpen: (citation: NewsCitation) => void;
}) {
  return (
    <div className="news-source-pills" role="group" aria-label="Quellen dieser Antwort">
      <span className="news-source-pills-label">Quellen</span>
      {citations.map((citation, index) => (
        <button
          key={`${citation.itemId}-${index}`}
          type="button"
          onClick={() => onOpen(citation)}
          title={citation.title}
        >
          <i>{index + 1}</i>
          <span>{citationHost(citation.url)}</span>
        </button>
      ))}
    </div>
  );
}

/* Pop-up hinter einer Quellenpille: Titel, Domain und Anriss auf einen Blick,
   plus die zwei Wege weiter — Lesemodus oder Originalseite. */
function SourceDialog({
  citation,
  onClose,
  onRead,
}: {
  citation: NewsCitation;
  onClose: () => void;
  onRead: (citation: NewsCitation) => void;
}) {
  return (
    <ModalFrame open title="Quelle" onClose={onClose} className="news-source-dialog">
      {(requestClose) => (
        <>
          <div className="modal-content">
            <div className="news-source-dialog-head">
              <span className="news-source-thumb">
                <img
                  src={`/api/v1/news/image/${citation.itemId}`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={(event) => {
                    event.currentTarget.style.opacity = "0";
                  }}
                />
              </span>
              <div>
                <strong>{citation.title}</strong>
                <small>{citationHost(citation.url)}</small>
              </div>
            </div>
            {citation.excerpt ? <p>{excerpt(citation.excerpt, 260)}</p> : null}
          </div>
          <div className="modal-actions">
            <a
              className="quiet-button"
              href={citation.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={requestClose}
            >
              <ExternalLink /> Original
            </a>
            <button
              type="button"
              className="quiet-button-primary"
              autoFocus
              onClick={() => {
                onRead(citation);
                requestClose();
              }}
            >
              Im Lesemodus öffnen
            </button>
          </div>
        </>
      )}
    </ModalFrame>
  );
}

function SourceList({
  citations,
  onOpen,
}: {
  citations: NewsCitation[];
  onOpen: (citation: NewsCitation) => void;
}) {
  return (
    <ol className="news-source-list">
      {citations.map((citation, index) => (
        <li key={`${citation.itemId}-${index}`}>
          <button type="button" onClick={() => onOpen(citation)}>
            <span className="news-source-thumb">
              <img
                src={`/api/v1/news/image/${citation.itemId}`}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(event) => {
                  event.currentTarget.style.opacity = "0";
                }}
              />
              <i>{index + 1}</i>
            </span>
            <span className="news-source-copy">
              <strong>{excerpt(citation.title, 96)}</strong>
              <small>{citationHost(citation.url)}</small>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function AiWorkspace({
  active,
  exchanges,
  pending,
  model,
  onModelChange,
  onAsk,
  onReset,
  onBack,
  onOpenCitation,
  aiEnabled,
}: {
  active: boolean;
  exchanges: AiExchange[];
  pending: boolean;
  model: NewsChatModel;
  onModelChange: (model: NewsChatModel) => void;
  onAsk: (question: string) => void;
  onReset: () => void;
  onBack: () => void;
  onOpenCitation: (citation: NewsCitation) => void;
  aiEnabled: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [pillCitation, setPillCitation] = useState<NewsCitation | null>(null);
  // Auf dem Handy führt jeder Quellenverweis erst ins Pop-up — der Lesemodus
  // deckt sonst unangekündigt den ganzen Bildschirm zu. Am Desktop bleibt es
  // beim direkten Sprung, dort steht die Quellenspalte ohnehin daneben.
  const compact = useMediaQuery(COMPACT_QUERY);
  const openCitation = compact ? setPillCitation : onOpenCitation;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latest = [...exchanges].reverse().find((entry) => entry.citations.length > 0);
  const sources = latest?.citations ?? [];
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 420);
    return () => window.clearTimeout(timer);
  }, [active]);
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [exchanges, pending]);
  const submit = (value = draft) => {
    const question = value.trim();
    if (!question || pending) return;
    onAsk(question);
    setDraft("");
  };
  return (
    <section
      className="news-ai-page"
      aria-label="KI-Recherche"
      aria-hidden={!active}
      inert={!active}
    >
      <header className="news-ai-header">
        <button className="news-icon-button news-ai-back" onClick={onBack} aria-label="Zurück zum Feed">
          <ArrowLeft />
        </button>
        <div className="news-ai-title">
          <Sparkles />
          <div>
            <strong>KI-Recherche</strong>
            <small>Antworten aus deinem eigenen Nachrichtenbestand</small>
          </div>
        </div>
        <div className="news-ai-header-actions">
          <label className="news-model-picker">
            <span>Modell</span>
            <select
              value={model}
              onChange={(event) => onModelChange(event.target.value as NewsChatModel)}
            >
              {newsChatModelOptions.map((option) => (
                <option key={option.id} value={option.id} title={option.hint}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="news-icon-button"
            onClick={onReset}
            disabled={exchanges.length === 0}
            aria-label="Neuen Chat starten"
            title="Neuen Chat starten"
          >
            <RotateCcw />
          </button>
        </div>
      </header>
      <div className="news-ai-layout">
        <div className="news-ai-thread" ref={scrollRef}>
          {exchanges.length === 0 ? (
            <div className="news-ai-welcome">
              <span className="news-ai-orb" aria-hidden>
                <Sparkles />
              </span>
              <h2>Was möchtest du wissen?</h2>
              <p>
                {aiEnabled
                  ? "Die Antwort entsteht ausschließlich aus den Nachrichten, die deine Workbench eingesammelt hat — mit Quellenangabe zum Nachlesen."
                  : "Ohne hinterlegten Mistral-Schlüssel liefert die Suche nur die passenden Nachrichten als Kurzfassung."}
              </p>
              <div className="news-ai-suggestions">
                {globalSuggestions.map((suggestion) => (
                  <button key={suggestion} onClick={() => submit(suggestion)}>
                    <span>{suggestion}</span>
                    <ChevronRight />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            exchanges.map((exchange) => (
              <article key={exchange.id} className="news-ai-exchange">
                <h2 className="news-ai-question">{exchange.question}</h2>
                {exchange.answer !== null ? (
                  <>
                    <div className="news-ai-answer">
                      <StreamingMarkdown
                        text={exchange.answer}
                        citations={exchange.citations}
                        onOpen={openCitation}
                      />
                    </div>
                    <div className="news-answer-tools">
                      <CopyButton text={exchange.answer} />
                      <button
                        type="button"
                        className="news-ghost-action"
                        onClick={() => submit(exchange.question)}
                        disabled={pending}
                      >
                        <RotateCcw /> <span>Neu erzeugen</span>
                      </button>
                      {exchange.model ? <span className="news-model-badge">{exchange.model}</span> : null}
                    </div>
                    {exchange.citations.length > 0 ? (
                      <SourcePills citations={exchange.citations} onOpen={setPillCitation} />
                    ) : null}
                  </>
                ) : exchange.error ? (
                  <p className="news-ai-error">{exchange.error}</p>
                ) : (
                  <div className="news-answer-skeleton">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </article>
            ))
          )}
        </div>
        <aside className="news-ai-sources" aria-label="Quellen">
          <header>
            <Library />
            <strong>Quellen</strong>
            {sources.length ? <small>{sources.length}</small> : null}
          </header>
          {sources.length === 0 ? (
            <p className="news-ai-sources-empty">
              Sobald eine Antwort da ist, stehen hier die Nachrichten, auf denen sie beruht.
            </p>
          ) : (
            <SourceList citations={sources} onOpen={onOpenCitation} />
          )}
        </aside>
      </div>
      <div className="news-ai-composer">
        <div className="news-ai-composer-field">
          <Sparkles />
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Frage an deinen Newsbestand …"
          />
          <button
            onClick={() => submit()}
            disabled={!draft.trim() || pending}
            aria-label="Frage senden"
          >
            <Send />
          </button>
        </div>
      </div>
      {pillCitation ? (
        <SourceDialog
          citation={pillCitation}
          onClose={() => setPillCitation(null)}
          onRead={onOpenCitation}
        />
      ) : null}
    </section>
  );
}

export function TechTldrs() {
  const client = useQueryClient();
  const compact = useMediaQuery(COMPACT_QUERY);
  const [tab, setTab] = useState<"feed" | "saved" | "ai">("feed");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<NewsCategory | "all">("all");
  const [importance, setImportance] = useState("all");
  const [media, setMedia] = useState("all");
  const [collectionId, setCollectionId] = useState<string>("all");
  const [reader, setReader] = useState<NewsItem | null>(null);
  const [saveItem, setSaveItem] = useState<NewsItem | null>(null);
  const [globalQuestion, setGlobalQuestion] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeStory, setActiveStory] = useState(0);
  const [aiExchanges, setAiExchanges] = useState<AiExchange[]>([]);
  const [aiModel, setAiModel] = useState<NewsChatModel>(() => {
    const stored = typeof window === "undefined" ? null : window.localStorage.getItem(MODEL_STORAGE_KEY);
    return newsChatModelOptions.some((option) => option.id === stored)
      ? (stored as NewsChatModel)
      : "auto";
  });
  const pendingSeen = useRef(new Set<string>());
  const seenThisSession = useRef(new Set<string>());
  const previousTab = useRef(tab);
  useEffect(() => {
    window.localStorage.setItem(MODEL_STORAGE_KEY, aiModel);
  }, [aiModel]);
  const listTab = tab === "ai" ? previousTab.current === "saved" ? "saved" : "feed" : tab;
  useEffect(() => {
    if (tab !== "ai") previousTab.current = tab;
  }, [tab]);
  const params = useMemo(() => {
    const value = new URLSearchParams({ limit: "30" });
    if (search.trim()) value.set("q", search.trim());
    if (category !== "all") value.set("category", category);
    if (importance !== "all") value.set("importance", importance);
    if (media !== "all") value.set("mediaType", media);
    if (listTab === "saved") value.set("saved", "true");
    if (collectionId !== "all") value.set("collectionId", collectionId);
    if (listTab === "feed" && !search.trim() && collectionId === "all")
      value.set("unread", "true");
    return value;
  }, [category, collectionId, importance, listTab, media, search]);
  const query = useInfiniteQuery({
    queryKey: ["news", params.toString()],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const pageParams = new URLSearchParams(params);
      if (pageParam) pageParams.set("cursor", pageParam);
      return apiClient.news(pageParams, signal);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
  const collections = useQuery(workbenchQueries.newsCollections());
  const sync = useMutation({
    mutationFn: () => apiClient.syncNews(),
    onSuccess: () => {
      window.setTimeout(
        () => void client.invalidateQueries({ queryKey: ["news"] }),
        2500,
      );
    },
  });
  const ask = useMutation({
    mutationFn: (input: { id: string; question: string }) =>
      apiClient.chatNews({
        question: input.question,
        itemId: null,
        model: aiModel,
        history: aiExchanges
          .filter((entry): entry is AiExchange & { answer: string } => Boolean(entry.answer))
          .slice(-3)
          .map((entry) => ({ question: entry.question, answer: entry.answer })),
      }),
    onSuccess: (result, input) =>
      setAiExchanges((list) =>
        list.map((entry) =>
          entry.id === input.id
            ? {
                ...entry,
                answer: result?.answer ?? "",
                citations: result?.citations ?? [],
                model: result?.model ?? null,
              }
            : entry,
        ),
      ),
    onError: (error, input) =>
      setAiExchanges((list) =>
        list.map((entry) =>
          entry.id === input.id
            ? {
                ...entry,
                error:
                  error instanceof Error
                    ? error.message
                    : "Die Anfrage konnte nicht beantwortet werden.",
              }
            : entry,
        ),
      ),
  });
  const deleteCollectionMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteNewsCollection(id),
    onSuccess: async (_, id) => {
      if (collectionId === id) setCollectionId("all");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["news"] }),
        client.invalidateQueries({ queryKey: ["news", "collections"] }),
      ]);
    },
  });
  const sentinel = useRef<HTMLDivElement>(null);
  const items = useMemo(() => {
    const unique = new Map<string, NewsItem>();
    for (const page of query.data?.pages ?? [])
      for (const item of page.items) if (!unique.has(item.id)) unique.set(item.id, item);
    return [...unique.values()];
  }, [query.data?.pages]);
  const total = query.data?.pages[0]?.total ?? 0;
  const syncState = query.data?.pages[0]?.sync;
  const selectedCollection = collections.data?.collections.find(
    (item) => item.id === collectionId,
  );
  const hasAdvancedFilters =
    importance !== "all" ||
    media !== "all" ||
    (listTab === "saved" && category !== "all");
  const isDefaultUnreadFeed = listTab === "feed" && !search.trim() && collectionId === "all" && category === "all" && importance === "all" && media === "all";
  const caughtUp = isDefaultUnreadFeed && items.length === 0 && Boolean(syncState?.lastSyncedAt);
  const showCollectionOverview =
    listTab === "saved" &&
    collectionId === "all" &&
    !search.trim() &&
    !hasAdvancedFilters &&
    (collections.data?.collections.length ?? 0) > 0;
  const resetSavedFilters = () => {
    setSearch("");
    setCategory("all");
    setImportance("all");
    setMedia("all");
    setCollectionId("all");
  };
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
  const markStorySeen = useCallback((item: NewsItem) => {
    if (item.read || seenThisSession.current.has(item.id) || pendingSeen.current.has(item.id)) return;
    pendingSeen.current.add(item.id);
    void apiClient.markNewsRead(item.id, { read: true }).then((result) => {
      seenThisSession.current.add(item.id);
      client.setQueryData<InfiniteData<NewsListResponse, string | null>>(
        ["news", params.toString()],
        (current) => current ? {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.map((candidate) => candidate.id === item.id
              ? { ...(result?.item ?? candidate), read: true }
              : candidate),
          })),
        } : current,
      );
    }).catch(() => {
      seenThisSession.current.delete(item.id);
    }).finally(() => {
      pendingSeen.current.delete(item.id);
    });
  }, [client, params]);
  useEffect(() => {
    setActiveStory(0);
  }, [params]);
  /* Der Sentinel darf nur im Desktop-Raster nachladen. Auf schmalen Geräten steckt er im
     ausgeblendeten Raster und meldete dauerhaft "sichtbar" — das lud den ganzen Bestand nach. */
  useEffect(() => {
    const element = sentinel.current;
    if (compact || !element || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "500px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [compact, hasNextPage, loadMore]);
  /* Gelesen wird erst nach kurzer Verweildauer — sonst zählt jedes Durchwischen als gesehen. */
  useEffect(() => {
    if (!compact || tab !== "feed" || search.trim() || collectionId !== "all") return;
    const item = items[activeStory];
    if (!item || item.read || seenThisSession.current.has(item.id)) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") markStorySeen(item);
    }, 1_100);
    return () => window.clearTimeout(timer);
  }, [activeStory, collectionId, compact, items, markStorySeen, search, tab]);
  const open = (item: NewsItem) => setReader(item);
  const openCitation = (citation: NewsCitation) => {
    const local = items.find((entry) => entry.id === citation.itemId);
    if (local) {
      setReader(local);
      return;
    }
    client
      .fetchQuery({
        queryKey: ["news", "item", citation.itemId],
        queryFn: () => apiClient.newsItem(citation.itemId),
        staleTime: 60_000,
      })
      .then((result) => {
        if (result?.item) setReader(result.item);
      })
      .catch(() => window.open(citation.url, "_blank", "noopener"));
  };
  const askAi = useCallback(
    (question: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAiExchanges((list) => [
        ...list,
        { id, question, answer: null, citations: [], model: null, error: null },
      ]);
      ask.mutate({ id, question });
    },
    [ask],
  );
  const submitQuestion = (value = globalQuestion) => {
    const question = value.trim();
    if (!question || ask.isPending) return;
    setGlobalQuestion("");
    setTab("ai");
    askAi(question);
  };
  return (
    <div className={`tech-tldrs-page ${tab === "ai" ? "is-ai" : ""}`}>
      <div className="news-surface news-surface-list" aria-hidden={tab === "ai"} inert={tab === "ai"}>
        <header className="news-page-header">
          <div className="news-title-lockup">
            <div className="news-title-mark">
              <Newspaper />
            </div>
            <div>
              <small>Persönlicher Tech-Radar</small>
              <h1>Tech TLDRs</h1>
            </div>
          </div>
          <div className="news-desktop-search">
            <Search />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nachrichten durchsuchen …"
            />
            {search ? (
              <button onClick={() => setSearch("")} aria-label="Suche löschen">
                <X />
              </button>
            ) : null}
          </div>
          <button
            className="news-sync-button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending || syncState?.running}
            aria-label="Nachrichten aktualisieren"
            title="Nachrichten aktualisieren"
          >
            <RefreshCw
              className={
                sync.isPending || syncState?.running ? "is-spinning" : ""
              }
            />
          </button>
        </header>
        <section className="news-command-row">
          <div
            className={`news-category-rail ${listTab === "saved" ? "news-collection-rail" : ""}`}
            aria-label={
              listTab === "saved"
                ? "Gespeicherte Sammlungen"
                : "Nachrichtenkategorien"
            }
          >
            {listTab === "saved" ? (
              <>
                <button
                  className={collectionId === "all" ? "is-active" : ""}
                  onClick={() => setCollectionId("all")}
                  aria-pressed={collectionId === "all"}
                >
                  <Library /> Alle gespeicherten
                </button>
                {collections.data?.collections.map((item) => (
                  <button
                    key={item.id}
                    className={collectionId === item.id ? "is-active" : ""}
                    onClick={() => setCollectionId(item.id)}
                    aria-pressed={collectionId === item.id}
                  >
                    <Bookmark /> {item.name}
                    <small>{item.itemCount}</small>
                  </button>
                ))}
              </>
            ) : (
              categories.map((item) => (
                <button
                  key={item.id}
                  className={category === item.id ? "is-active" : ""}
                  onClick={() => setCategory(item.id)}
                  aria-pressed={category === item.id}
                >
                  {item.label}
                </button>
              ))
            )}
          </div>
          <button
            className={`news-filter-trigger ${filtersOpen || hasAdvancedFilters ? "is-active" : ""}`}
            onClick={() => setFiltersOpen((value) => !value)}
            aria-expanded={filtersOpen}
            aria-label="Filter"
          >
            <Filter />
            <span>Filter</span>
            <ChevronDown />
          </button>
        </section>
        {filtersOpen ? (
          <section className="news-filter-panel">
            <label>
              Wichtigkeit
              <select
                value={importance}
                onChange={(event) => setImportance(event.target.value)}
              >
                <option value="all">Alle</option>
                <option value="top">Top</option>
                <option value="important">Wichtig</option>
                <option value="relevant">Relevant</option>
                <option value="more">Weitere</option>
              </select>
            </label>
            <label>
              Format
              <select
                value={media}
                onChange={(event) => setMedia(event.target.value)}
              >
                <option value="all">Alles</option>
                <option value="article">Artikel</option>
                <option value="video">Video</option>
              </select>
            </label>
            {listTab === "saved" ? (
              <label>
                Kategorie
                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as NewsCategory | "all")
                  }
                >
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </section>
        ) : null}
        <section className="news-ask-bar">
          <Sparkles />
          <input
            value={globalQuestion}
            onChange={(event) => setGlobalQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitQuestion();
            }}
            placeholder="Frag deine Nachrichten, z. B. Was waren diese Woche die wichtigsten Modell-Releases?"
          />
          <button
            onClick={() => submitQuestion()}
            disabled={!globalQuestion.trim() || ask.isPending}
          >
            <span>{ask.isPending ? "Analysiert …" : "Fragen"}</span>
            <Send />
          </button>
        </section>
        <main className="news-content">
          {query.isLoading ? (
            <>
              <div className="news-bento-grid">
                {Array.from({ length: 8 }, (_, index) => (
                  <div
                    key={index}
                    className={`news-card-skeleton size-${index % 7}`}
                  >
                    <span />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
              <div className="news-mobile-loading" role="status">
                <RefreshCw className="is-spinning" />
                <span>
                  {listTab === "saved"
                    ? "Gespeicherte werden geladen"
                    : "Nachrichten werden geladen"}
                </span>
              </div>
            </>
          ) : items.length === 0 ? (
            <div className="news-empty">
              <div>
                <Library />
              </div>
              <h2>
                {listTab === "saved"
                  ? selectedCollection
                    ? `Keine Beiträge in „${selectedCollection.name}“`
                    : search.trim() || hasAdvancedFilters
                      ? "Keine passenden gespeicherten Beiträge"
                      : "Noch nichts gespeichert"
                  : caughtUp
                    ? "Du bist auf dem neuesten Stand"
                    : search.trim() || hasAdvancedFilters
                      ? "Keine passenden Nachrichten"
                      : "Der Feed wird vorbereitet"}
              </h2>
              <p>
                {listTab === "saved"
                  ? selectedCollection || search.trim() || hasAdvancedFilters
                    ? "Passe die Auswahl an oder zeige wieder alle gespeicherten Nachrichten."
                    : "Öffne eine Nachricht und lege sie in einer Sammlung ab."
                  : caughtUp
                    ? "Alle aktuellen Nachrichten wurden angesehen. Neue Meldungen erscheinen hier, sobald sie verfügbar sind."
                    : search.trim() || hasAdvancedFilters
                      ? "Passe deine Suche oder die aktiven Filter an."
                      : "Starte die Synchronisierung, um die ersten Tech-News aus den konfigurierten Quellen einzulesen."}
              </p>
              {listTab === "feed" ? (
                <button
                  className="news-primary-button"
                  onClick={() => caughtUp ? void query.refetch() : sync.mutate()}
                  disabled={sync.isPending || query.isRefetching}
                >
                  <RefreshCw />
                  <span>{caughtUp ? "Neu laden" : "Jetzt synchronisieren"}</span>
                </button>
              ) : (
                <button
                  className="news-primary-button"
                  onClick={() => {
                    if (
                      selectedCollection ||
                      search.trim() ||
                      hasAdvancedFilters
                    ) {
                      resetSavedFilters();
                    } else {
                      setTab("feed");
                    }
                  }}
                >
                  {selectedCollection || search.trim() || hasAdvancedFilters ? (
                    <>
                      <X /> <span>Alle gespeicherten zeigen</span>
                    </>
                  ) : (
                    <>
                      <Newspaper /> <span>Zum Feed</span>
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <>
              {listTab === "saved" ? (
                <div className="news-saved-stats">
                  <strong><AnimatedNumber value={total} /></strong> gespeicherte Beiträge
                  {selectedCollection ? (
                    <>
                      {" "}
                      in <em>„{selectedCollection.name}“</em>
                    </>
                  ) : null}
                </div>
              ) : null}
              {showCollectionOverview ? (
                <section
                  className="news-collections-overview"
                  aria-label="Sammlungen"
                >
                   {collections.data!.collections.map((collection, index) => {
                    const previews = items
                      .filter((item) => item.collectionIds.includes(collection.id))
                      .slice(0, 4);
                    return (
                      <div
                        key={collection.id}
                        className={`news-collection-card collection-size-${index % 5} preview-count-${previews.length}`}
                      >
                        <button
                          type="button"
                          className="news-collection-open"
                          onClick={() => setCollectionId(collection.id)}
                          aria-label={`${collection.name}, ${collection.itemCount} Beiträge öffnen`}
                        >
                          {previews.length > 0 ? (
                            <div className="news-collection-preview" aria-hidden>
                              {previews.map((item) => (
                                <Cover key={item.id} item={item} />
                              ))}
                            </div>
                          ) : null}
                          {previews.length > 0 ? (
                            <div className="news-collection-shade" aria-hidden />
                          ) : null}
                          <Bookmark />
                          <span>
                            <strong>{collection.name}</strong>
                            <small>{collection.itemCount} Beiträge</small>
                          </span>
                          <ChevronRight />
                        </button>
                        <CollectionDeleteButton
                          collection={collection}
                          onDeleted={() =>
                            deleteCollectionMutation.mutate(collection.id)
                          }
                        />
                      </div>
                    );
                  })}
                </section>
              ) : null}
              <div className="news-bento-grid">
                {items.map((item, index) => (
                  <NewsCard
                    key={item.id}
                    item={item}
                    index={index}
                    onOpen={() => open(item)}
                    onSave={() => setSaveItem(item)}
                  />
                ))}
              </div>
              {!showCollectionOverview ? (
                <>
                  <MobileStoryFeed
                    items={items}
                    index={Math.min(activeStory, items.length - 1)}
                    onIndexChange={setActiveStory}
                    onOpen={open}
                    onSave={setSaveItem}
                    onNeedMore={loadMore}
                  />
                  <div className="news-story-progress" aria-hidden>
                    <div className="news-story-progress-track">
                      <i
                        style={{
                          transform: `scaleX(${items.length ? (Math.min(activeStory, items.length - 1) + 1) / Math.max(total, items.length) : 0})`,
                        }}
                      />
                    </div>
                    <span>
                      <AnimatedNumber value={Math.min(activeStory, items.length - 1) + 1} />
                      {" / "}
                      <AnimatedNumber value={Math.max(total, items.length)} />
                    </span>
                  </div>
                </>
              ) : null}
              <div ref={sentinel} className="news-load-sentinel" aria-hidden>
                {query.isFetchingNextPage
                  ? "Weitere Nachrichten werden geladen …"
                  : ""}
              </div>
            </>
          )}
        </main>
      </div>
      <div className="news-surface news-surface-ai">
        <AiWorkspace
          active={tab === "ai"}
          exchanges={aiExchanges}
          pending={ask.isPending}
          model={aiModel}
          onModelChange={setAiModel}
          onAsk={askAi}
          onReset={() => setAiExchanges([])}
          onBack={() => setTab(listTab)}
          onOpenCitation={openCitation}
          aiEnabled={syncState?.aiEnabled ?? false}
        />
      </div>
      <nav className="news-dynamic-island" aria-label="Tech TLDRs Bereiche">
        <div className="news-island-switch">
          <button
            className={tab === "feed" ? "is-active" : ""}
            onClick={() => {
              setTab("feed");
              setCollectionId("all");
            }}
            aria-current={tab === "feed" ? "page" : undefined}
          >
            <Newspaper /> Feed
          </button>
          <button
            className={tab === "saved" ? "is-active" : ""}
            onClick={() => setTab("saved")}
            aria-current={tab === "saved" ? "page" : undefined}
          >
            <Bookmark /> Gespeichert
          </button>
        </div>
        <button
          className={`news-island-ai ${tab === "ai" ? "is-active" : ""}`}
          onClick={() => setTab("ai")}
          aria-label="KI-Recherche öffnen"
          aria-current={tab === "ai" ? "page" : undefined}
        >
          <Sparkles />
        </button>
      </nav>
      {reader ? (
        <ArticleReader
          item={reader}
          onClose={() => setReader(null)}
          onItemChange={setReader}
          collections={collections.data?.collections ?? []}
          onOpenCitation={openCitation}
          onDeleteCollection={(id) => deleteCollectionMutation.mutate(id)}
          model={aiModel}
        />
      ) : null}
      {saveItem ? (
        <div
          className="news-reader-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSaveItem(null);
          }}
        >
          <SavePanel
            item={saveItem}
            collections={collections.data?.collections ?? []}
            onClose={() => setSaveItem(null)}
            onDeleteCollection={(id) => deleteCollectionMutation.mutate(id)}
          />
        </div>
      ) : null}
    </div>
  );
}

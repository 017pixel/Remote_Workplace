import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  NewsCategory,
  NewsCitation,
  NewsCollection,
  NewsItem,
  NewsListResponse,
} from "@workbench/contracts";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Filter,
  Library,
  Newspaper,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { workbenchQueries } from "../lib/queryOptions";
import { ConfirmDialog } from "../components/ModalDialog";

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

function NewsMarkdown({
  text,
  citations,
  onOpen,
}: {
  text: string;
  citations: NewsCitation[];
  onOpen: (citation: NewsCitation) => void;
}) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <>
      {paragraphs.map((paragraph, index) => {
        const trimmed = paragraph.trim();
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
          return <hr key={index} className="news-md-rule" />;
        }
        const headingMatch = /^(#{1,3})\s+(.*)$/.exec(trimmed);
        if (headingMatch) {
          const hashes = headingMatch[1] ?? "";
          const content = headingMatch[2] ?? "";
          const level = hashes.length;
          const className = `news-md-h news-md-h${level}`;
          if (level === 1) {
            return <h4 key={index} className={className}>{renderInline(content, citations, onOpen)}</h4>;
          }
          if (level === 2) {
            return <h5 key={index} className={className}>{renderInline(content, citations, onOpen)}</h5>;
          }
          return <h6 key={index} className={className}>{renderInline(content, citations, onOpen)}</h6>;
        }
        if (/^>\s?/.test(trimmed)) {
          return (
            <blockquote key={index} className="news-md-quote">
              {renderInline(trimmed.replace(/^>\s?/, ""), citations, onOpen)}
            </blockquote>
          );
        }
        const codeMatch = /^```(\w*)\n([\s\S]*?)```$/.exec(trimmed);
        if (codeMatch) {
          return (
            <pre key={index} className="news-md-pre">
              <code>{codeMatch[2]}</code>
            </pre>
          );
        }
        const lines = paragraph.split(/\n/).filter((line) => line.trim().length > 0);
        const isList = lines.length > 1 && lines.every((line) => /^[-*]\s+/.test(line.trim()));
        if (isList) {
          return (
            <ul key={index} className="news-answer-list">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  {renderInline(line.replace(/^[-*]\s+/, ""), citations, onOpen)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>{renderInline(paragraph, citations, onOpen)}</p>
        );
      })}
    </>
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
          placeholder="Neue Sammlung"
        />
        <button
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          <Plus /> Anlegen
        </button>
      </div>
      <button
        className="news-primary-button"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Speichert …" : "Auswahl speichern"}
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
}: {
  item: NewsItem;
  onClose: () => void;
  onItemChange: (item: NewsItem) => void;
  collections: NewsCollection[];
  onOpenCitation: (citation: NewsCitation) => void;
  onDeleteCollection: (id: string) => void;
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

export function TechTldrs() {
  const client = useQueryClient();
  const [tab, setTab] = useState<"feed" | "saved">("feed");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<NewsCategory | "all">("all");
  const [importance, setImportance] = useState("all");
  const [media, setMedia] = useState("all");
  const [collectionId, setCollectionId] = useState<string>("all");
  const [reader, setReader] = useState<NewsItem | null>(null);
  const [saveItem, setSaveItem] = useState<NewsItem | null>(null);
  const [globalQuestion, setGlobalQuestion] = useState("");
  const [globalAnswer, setGlobalAnswer] = useState<{
    answer: string;
    citations: NewsCitation[];
  } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [activeStory, setActiveStory] = useState(0);
  const mobileFeed = useRef<HTMLDivElement>(null);
  const seenTimers = useRef(new Map<string, number>());
  const pendingSeen = useRef(new Set<string>());
  const seenThisSession = useRef(new Set<string>());
  const params = useMemo(() => {
    const value = new URLSearchParams({ limit: "30" });
    if (search.trim()) value.set("q", search.trim());
    if (category !== "all") value.set("category", category);
    if (importance !== "all") value.set("importance", importance);
    if (media !== "all") value.set("mediaType", media);
    if (tab === "saved") value.set("saved", "true");
    if (collectionId !== "all") value.set("collectionId", collectionId);
    if (tab === "feed" && !search.trim() && collectionId === "all")
      value.set("unread", "true");
    return value;
  }, [category, collectionId, importance, media, search, tab]);
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
    mutationFn: (question: string) =>
      apiClient.chatNews({ question, itemId: null, history: [] }),
    onSuccess: (result) =>
      setGlobalAnswer(
        result
          ? { answer: result.answer, citations: result.citations }
          : null,
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
    (tab === "saved" && category !== "all");
  const isDefaultUnreadFeed = tab === "feed" && !search.trim() && collectionId === "all" && category === "all" && importance === "all" && media === "all";
  const caughtUp = isDefaultUnreadFeed && items.length === 0 && Boolean(syncState?.lastSyncedAt);
  const showCollectionOverview =
    tab === "saved" &&
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
    const element = sentinel.current;
    if (!element || !query.hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !query.isFetchingNextPage)
          void query.fetchNextPage();
      },
      { rootMargin: "500px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);
  useEffect(() => {
    const root = mobileFeed.current;
    if (!root || tab !== "feed" || search.trim() || collectionId !== "all") return;
    const clearTimer = (id: string) => {
      const timer = seenTimers.current.get(id);
      if (timer !== undefined) window.clearTimeout(timer);
      seenTimers.current.delete(id);
    };
    const clearAll = () => {
      for (const timer of seenTimers.current.values()) window.clearTimeout(timer);
      seenTimers.current.clear();
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.newsId;
        if (!id) continue;
        const index = items.findIndex((item) => item.id === id);
        if (entry.isIntersecting && entry.intersectionRatio >= .7) {
          if (index >= 0) setActiveStory(index);
          if (document.visibilityState !== "visible" || !document.hasFocus() || seenTimers.current.has(id)) continue;
          const item = items[index];
          if (!item || item.read || seenThisSession.current.has(id) || pendingSeen.current.has(id)) continue;
          seenTimers.current.set(id, window.setTimeout(() => {
            seenTimers.current.delete(id);
            if (document.visibilityState === "visible" && document.hasFocus()) markStorySeen(item);
          }, 1_000));
        } else {
          clearTimer(id);
        }
      }
    }, { root, threshold: [.7] });
    root.querySelectorAll<HTMLElement>(".news-story[data-news-id]").forEach((story) => observer.observe(story));
    const onVisibilityChange = () => { if (document.visibilityState !== "visible" || !document.hasFocus()) clearAll(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", clearAll);
    return () => {
      observer.disconnect();
      clearAll();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", clearAll);
    };
  }, [collectionId, items, markStorySeen, search, tab]);
  useEffect(() => {
    if (!aiOpen) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAiOpen(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [aiOpen]);
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
  const submitQuestion = (value = globalQuestion) => {
    if (value.trim() && !ask.isPending) {
      ask.mutate(value.trim());
      setGlobalAnswer(null);
    }
  };
  return (
    <div className="tech-tldrs-page">
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
        >
          <RefreshCw
            className={
              sync.isPending || syncState?.running ? "is-spinning" : ""
            }
          />
          <span>Aktualisieren</span>
        </button>
      </header>
      <section className="news-command-row">
        <div
          className={`news-category-rail ${tab === "saved" ? "news-collection-rail" : ""}`}
          aria-label={
            tab === "saved"
              ? "Gespeicherte Sammlungen"
              : "Nachrichtenkategorien"
          }
        >
          {tab === "saved" ? (
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
        >
          <Filter /> Filter <ChevronDown />
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
          {tab === "saved" ? (
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
          {ask.isPending ? "Analysiert …" : "Fragen"}
        </button>
      </section>
      {globalAnswer ? (
        <section className="news-global-answer">
          <button
            onClick={() => setGlobalAnswer(null)}
            aria-label="Antwort schließen"
          >
            <X />
          </button>
          <small>
            <Sparkles /> Antwort aus deinem Newsbestand
          </small>
          <StreamingMarkdown
            text={globalAnswer.answer}
            citations={globalAnswer.citations}
            onOpen={openCitation}
          />
        </section>
      ) : null}
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
                {tab === "saved"
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
              {tab === "saved"
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
              {tab === "saved"
                ? selectedCollection || search.trim() || hasAdvancedFilters
                  ? "Passe die Auswahl an oder zeige wieder alle gespeicherten Nachrichten."
                  : "Öffne eine Nachricht und lege sie in einer Sammlung ab."
                : caughtUp
                  ? "Alle aktuellen Nachrichten wurden angesehen. Neue Meldungen erscheinen hier, sobald sie verfügbar sind."
                  : search.trim() || hasAdvancedFilters
                    ? "Passe deine Suche oder die aktiven Filter an."
                    : "Starte die Synchronisierung, um die ersten Tech-News aus den konfigurierten Quellen einzulesen."}
            </p>
            {tab === "feed" ? (
              <button
                className="news-primary-button"
                onClick={() => caughtUp ? void query.refetch() : sync.mutate()}
                disabled={sync.isPending || query.isRefetching}
              >
                <RefreshCw /> {caughtUp ? "Neu laden" : "Jetzt synchronisieren"}
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
                    <X /> Alle gespeicherten zeigen
                  </>
                ) : (
                  <>
                    <Newspaper /> Zum Feed
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          <>
            {tab === "saved" ? (
              <div className="news-saved-stats">
                <strong>{total}</strong> gespeicherte Beiträge
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
                <div
                  ref={mobileFeed}
                  className="news-mobile-feed"
                  onScroll={(event) => {
                    const element = event.currentTarget;
                    const index = Math.round(
                      element.scrollTop / element.clientHeight,
                    );
                    if (index !== activeStory) setActiveStory(index);
                    if (
                      element.scrollTop + element.clientHeight >=
                        element.scrollHeight - element.clientHeight * 1.5 &&
                      query.hasNextPage &&
                      !query.isFetchingNextPage
                    )
                      void query.fetchNextPage();
                  }}
                >
              {items.map((item) => (
                <article key={item.id} className="news-story" data-news-id={item.id}>
                  <Cover item={item} large />
                  <div className="news-story-scrim" />
                  <div className="news-story-copy">
                    <div>
                      <span
                        className={`news-importance is-${item.importanceBand}`}
                      >
                        {importanceLabel(item)} · {item.importanceScore}
                      </span>
                      <span>{categoryLabel(item.category)}</span>
                      <span>{item.source.name}</span>
                    </div>
                    <h2>{item.title}</h2>
                    <p>{excerpt(item.tldr, 320)}</p>
                    <footer>
                      <button onClick={() => open(item)}>Lesen</button>
                      <button
                        onClick={() => setSaveItem(item)}
                        aria-label="Speichern"
                      >
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
              ))}
                </div>
                <div className="news-story-progress" aria-hidden>
                  <div className="news-story-progress-track">
                    <i
                      style={{
                        transform: `scaleX(${items.length ? (Math.min(activeStory, items.length - 1) + 1) / items.length : 0})`,
                      }}
                    />
                  </div>
                  <span>
                    {Math.min(activeStory, items.length - 1) + 1} / {items.length}
                    {query.isFetchingNextPage ? " · lädt …" : ""}
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
          className="news-island-ai"
          onClick={() => setAiOpen(true)}
          aria-label="KI-Assistent öffnen"
        >
          <Sparkles />
        </button>
      </nav>
      {aiOpen ? (
        <div
          className="news-reader-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAiOpen(false);
          }}
        >
          <div
            className="news-ai-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="KI-Assistent"
          >
            <header>
              <Sparkles />
              <div>
                <strong>Frag deine Nachrichten</strong>
                <small>Antworten aus deinem gesamten Newsbestand</small>
              </div>
              <button
                className="news-icon-button"
                onClick={() => setAiOpen(false)}
                aria-label="Schließen"
              >
                <X />
              </button>
            </header>
            <div className="news-ai-sheet-body">
              {globalAnswer ? (
                <div className="news-ai-answer">
                  <StreamingMarkdown
                    text={globalAnswer.answer}
                    citations={globalAnswer.citations}
                    onOpen={(citation) => {
                      setAiOpen(false);
                      openCitation(citation);
                    }}
                  />
                </div>
              ) : (
                <div className="news-chat-intro">
                  <span>Frag zum Beispiel:</span>
                  {globalSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => submitQuestion(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
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
                value={globalQuestion}
                onChange={(event) => setGlobalQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitQuestion();
                  }
                }}
                placeholder="Frage an deinen Newsbestand …"
              />
              <button
                onClick={() => submitQuestion()}
                disabled={!globalQuestion.trim() || ask.isPending}
                aria-label="Frage senden"
              >
                <Send />
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {reader ? (
        <ArticleReader
          item={reader}
          onClose={() => setReader(null)}
          onItemChange={setReader}
          collections={collections.data?.collections ?? []}
          onOpenCitation={openCitation}
          onDeleteCollection={(id) => deleteCollectionMutation.mutate(id)}
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

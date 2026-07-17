import { useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  NewsCategory,
  NewsCollection,
  NewsItem,
} from "@workbench/contracts";
import {
  Bookmark,
  Check,
  ChevronDown,
  ExternalLink,
  Filter,
  Library,
  MessageCircle,
  Newspaper,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { workbenchQueries } from "../lib/queryOptions";

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

function SavePanel({
  item,
  collections,
  onClose,
  onSaved,
}: {
  item: NewsItem;
  collections: NewsCollection[];
  onClose: () => void;
  onSaved?: (item: NewsItem) => void;
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
          <label key={collection.id}>
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

function ArticleReader({
  item,
  onClose,
  onItemChange,
  collections,
}: {
  item: NewsItem;
  onClose: () => void;
  onItemChange: (item: NewsItem) => void;
  collections: NewsCollection[];
}) {
  const client = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<
    Array<{ question: string; answer: string; citations: number }>
  >([]);
  const ask = useMutation({
    mutationFn: (value: string) =>
      apiClient.chatNews({ question: value, itemId: item.id }),
    onSuccess: (result, value) => {
      if (result)
        setMessages((list) => [
          ...list,
          {
            question: value,
            answer: result.answer,
            citations: result.citations.length,
          },
        ]);
      setQuestion("");
    },
  });
  useEffect(() => {
    void apiClient
      .markNewsRead(item.id, { read: true })
      .then(() => client.invalidateQueries({ queryKey: ["news"] }));
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [client, item.id, onClose]);
  useEffect(() => {
    if (!chatOpen) return;
    const timer = window.setTimeout(() => chatInput.current?.focus(), 320);
    return () => window.clearTimeout(timer);
  }, [chatOpen]);
  const submit = () => {
    if (question.trim() && !ask.isPending) ask.mutate(question.trim());
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
      >
        <div className="news-reader-controls">
          <button
            className={`news-reader-chat-toggle ${chatOpen ? "is-active" : ""}`}
            onClick={() => setChatOpen((value) => !value)}
            aria-label={chatOpen ? "KI-Chat ausblenden" : "KI-Chat öffnen"}
            aria-expanded={chatOpen}
            aria-controls={`news-chat-${item.id}`}
          >
            <MessageCircle />
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
        <div className="news-reader-scroll">
          <Cover item={item} large />
          <div className="news-reader-body">
            <div className="news-reader-meta">
              <span className={`news-importance is-${item.importanceBand}`}>
                {item.importanceBand === "top" ? "Top" : "Wichtig"} ·{" "}
                {item.importanceScore}
              </span>
              <span>{categoryLabel(item.category)}</span>
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
            <MessageCircle />
            <div>
              <strong>Diese Nachricht verstehen</strong>
              <small>Antworten nur aus dem Artikel</small>
            </div>
            <button
              className="news-chat-close"
              onClick={() => setChatOpen(false)}
              aria-label="KI-Chat schließen"
            >
              <X />
            </button>
          </header>
          <div className="news-chat-messages">
            {messages.length === 0 ? (
              <div className="news-chat-intro">
                <span>Frag zum Beispiel:</span>
                <button
                  onClick={() =>
                    ask.mutate(
                      "Was ist daran im Vergleich zum bisherigen Stand neu?",
                    )
                  }
                >
                  Was ist konkret neu?
                </button>
                <button
                  onClick={() =>
                    ask.mutate(
                      "Welche praktischen Auswirkungen hat diese Nachricht für Entwickler?",
                    )
                  }
                >
                  Auswirkung für Entwickler?
                </button>
              </div>
            ) : (
              messages.map((message, index) => (
                <div key={index}>
                  <p className="is-question">{message.question}</p>
                  <p className="is-answer">
                    {message.answer}
                    <small>
                      {message.citations} Quelle
                      {message.citations === 1 ? "" : "n"} verwendet
                    </small>
                  </p>
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
              onClick={submit}
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
    >
      <button
        className="news-card-open"
        onClick={onOpen}
        aria-label={`${item.title} öffnen`}
      >
        <Cover item={item} />
        <div className="news-card-body">
          <div className="news-card-meta">
            <span>{categoryLabel(item.category)}</span>
            <span>{formatDate(item.publishedAt)}</span>
          </div>
          <h2>{item.title}</h2>
          <p>{excerpt(item.tldr, index % 7 === 0 ? 300 : 190)}</p>
          <footer>
            <span className={`news-importance is-${item.importanceBand}`}>
              {item.importanceBand === "top"
                ? "Top"
                : item.importanceBand === "important"
                  ? "Wichtig"
                  : "Relevant"}{" "}
              · {item.importanceScore}
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
  const [globalAnswer, setGlobalAnswer] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const params = useMemo(() => {
    const value = new URLSearchParams({ limit: "30" });
    if (search.trim()) value.set("q", search.trim());
    if (category !== "all") value.set("category", category);
    if (importance !== "all") value.set("importance", importance);
    if (media !== "all") value.set("mediaType", media);
    if (tab === "saved") value.set("saved", "true");
    if (collectionId !== "all") value.set("collectionId", collectionId);
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
      apiClient.chatNews({ question, itemId: null }),
    onSuccess: (result) => setGlobalAnswer(result?.answer ?? null),
  });
  const sentinel = useRef<HTMLDivElement>(null);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const syncState = query.data?.pages[0]?.sync;
  const selectedCollection = collections.data?.collections.find(
    (item) => item.id === collectionId,
  );
  const hasAdvancedFilters =
    importance !== "all" ||
    media !== "all" ||
    (tab === "saved" && category !== "all");
  const resetSavedFilters = () => {
    setSearch("");
    setCategory("all");
    setImportance("all");
    setMedia("all");
    setCollectionId("all");
  };
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
  const open = (item: NewsItem) => setReader(item);
  const submitQuestion = () => {
    if (globalQuestion.trim()) {
      ask.mutate(globalQuestion.trim());
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
        <MessageCircle />
        <input
          value={globalQuestion}
          onChange={(event) => setGlobalQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitQuestion();
          }}
          placeholder="Frag deine Nachrichten, z. B. Was waren diese Woche die wichtigsten Modell-Releases?"
        />
        <button
          onClick={submitQuestion}
          disabled={!globalQuestion.trim() || ask.isPending}
        >
          {ask.isPending ? "Denkt …" : "Fragen"}
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
          <small>Antwort aus deinem Newsbestand</small>
          <p>{globalAnswer}</p>
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
                : "Der Feed wird vorbereitet"}
            </h2>
            <p>
              {tab === "saved"
                ? selectedCollection || search.trim() || hasAdvancedFilters
                  ? "Passe die Auswahl an oder zeige wieder alle gespeicherten Nachrichten."
                  : "Öffne eine Nachricht und lege sie in einer Sammlung ab."
                : "Starte die Synchronisierung, um die ersten Tech-News aus den konfigurierten Quellen einzulesen."}
            </p>
            {tab === "feed" ? (
              <button
                className="news-primary-button"
                onClick={() => sync.mutate()}
                disabled={sync.isPending}
              >
                <RefreshCw /> Jetzt synchronisieren
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
            <div
              className="news-mobile-feed"
              onScroll={(event) => {
                const element = event.currentTarget;
                if (
                  element.scrollTop + element.clientHeight >= element.scrollHeight - element.clientHeight * 1.5 &&
                  query.hasNextPage &&
                  !query.isFetchingNextPage
                ) void query.fetchNextPage();
              }}
            >
              {items.map((item) => (
                <article key={item.id} className="news-story">
                  <Cover item={item} large />
                  <div className="news-story-scrim" />
                  <div className="news-story-copy">
                    <div>
                      <span
                        className={`news-importance is-${item.importanceBand}`}
                      >
                        {item.importanceBand === "top" ? "Top" : "Wichtig"} ·{" "}
                        {item.importanceScore}
                      </span>
                      <span>{categoryLabel(item.category)}</span>
                    </div>
                    <h2>{item.title}</h2>
                    <p>{excerpt(item.tldr, 320)}</p>
                    <footer>
                      <button onClick={() => open(item)}>Vollversion</button>
                      <button
                        onClick={() => setSaveItem(item)}
                        aria-label="Speichern"
                      >
                        <Bookmark className={item.saved ? "is-filled" : ""} />
                      </button>
                    </footer>
                  </div>
                </article>
              ))}
            </div>
            <div ref={sentinel} className="news-load-sentinel" aria-hidden>
              {query.isFetchingNextPage
                ? "Weitere Nachrichten werden geladen …"
                : ""}
            </div>
          </>
        )}
      </main>
      <nav className="news-dynamic-island" aria-label="Tech TLDRs Bereiche">
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
      </nav>
      {reader ? (
        <ArticleReader
          item={reader}
          onClose={() => setReader(null)}
          onItemChange={setReader}
          collections={collections.data?.collections ?? []}
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
          />
        </div>
      ) : null}
    </div>
  );
}

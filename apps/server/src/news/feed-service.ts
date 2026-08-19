import { XMLParser } from "fast-xml-parser";
import type { NewsSource } from "@wrapt/contracts";
import { settings } from "../config/settings.js";
import { fetchPublic, readBodyLimited } from "../security/public-http.js";
import type { IncomingNewsItem, NewsDatabase } from "./database.js";

export interface FeedDefinition {
  source: NewsSource;
  feedUrl: string;
}

interface ParsedFeed {
  rss?: { channel?: { item?: FeedEntry | FeedEntry[] } };
  feed?: { entry?: FeedEntry | FeedEntry[] };
}

type FeedEntry = Record<string, unknown>;

export const feedDefinitions: FeedDefinition[] = [
  { source: { id: "openai", name: "OpenAI", homepageUrl: "https://openai.com/news/", kind: "rss", priority: 1 }, feedUrl: "https://openai.com/news/rss.xml" },
  { source: { id: "deepmind", name: "Google DeepMind", homepageUrl: "https://deepmind.google/discover/blog/", kind: "rss", priority: 1 }, feedUrl: "https://deepmind.google/blog/rss.xml" },
  { source: { id: "google-ai", name: "Google AI", homepageUrl: "https://blog.google/technology/ai/", kind: "rss", priority: 1 }, feedUrl: "https://blog.google/technology/ai/rss/" },
  { source: { id: "hugging-face", name: "Hugging Face", homepageUrl: "https://huggingface.co/blog", kind: "rss", priority: 1 }, feedUrl: "https://huggingface.co/blog/feed.xml" },
  { source: { id: "github-changelog", name: "GitHub Changelog", homepageUrl: "https://github.blog/changelog/", kind: "rss", priority: 2 }, feedUrl: "https://github.blog/changelog/feed/" },
  { source: { id: "nvidia-developer", name: "NVIDIA Developer", homepageUrl: "https://developer.nvidia.com/blog/", kind: "atom", priority: 2 }, feedUrl: "https://developer.nvidia.com/blog/feed/" },
  { source: { id: "meta-engineering", name: "Meta Engineering", homepageUrl: "https://engineering.fb.com/", kind: "rss", priority: 2 }, feedUrl: "https://engineering.fb.com/feed/" },
  { source: { id: "ars-ai", name: "Ars Technica", homepageUrl: "https://arstechnica.com/ai/", kind: "rss", priority: 2 }, feedUrl: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
  { source: { id: "techcrunch", name: "TechCrunch", homepageUrl: "https://techcrunch.com/", kind: "rss", priority: 3 }, feedUrl: "https://techcrunch.com/feed/" },
  { source: { id: "the-verge", name: "The Verge", homepageUrl: "https://www.theverge.com/", kind: "atom", priority: 3 }, feedUrl: "https://www.theverge.com/rss/index.xml" },
  { source: { id: "eff", name: "Electronic Frontier Foundation", homepageUrl: "https://www.eff.org/", kind: "rss", priority: 2 }, feedUrl: "https://www.eff.org/rss/updates.xml" },
  { source: { id: "eu-digital", name: "EU Digital Strategy", homepageUrl: "https://digital-strategy.ec.europa.eu/", kind: "rss", priority: 1 }, feedUrl: "https://digital-strategy.ec.europa.eu/en/rss.xml" },
  { source: { id: "youtube-fireship", name: "Fireship", homepageUrl: "https://www.youtube.com/@Fireship", kind: "youtube", priority: 3 }, feedUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA" },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "#text",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const array = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const text = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(" ");
  if (value && typeof value === "object" && "#text" in value) {
    return text((value as { "#text": unknown })["#text"]);
  }
  return "";
};

const clean = (value: string) =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const attribute = (markup: string, name: string) => {
  const match = markup.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1]?.trim() ?? "";
};

const firstUrl = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = firstUrl(item);
      if (candidate) return candidate;
    }
    return "";
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return text(record["@_href"] ?? record["@_url"] ?? record["#text"]).trim();
  }
  return "";
};

const entryUrl = (value: unknown): string => {
  const values = Array.isArray(value) ? value : [value];
  const alternate = values.find((candidate) =>
    candidate && typeof candidate === "object" && (candidate as Record<string, unknown>)["@_rel"] === "alternate",
  );
  return firstUrl(alternate ?? value);
};

const safeDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const safeUrl = (value: string, base: string) => {
  if (!value.trim() || /[<>]/.test(value)) return null;
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

const rawEntryContent = (entry: FeedEntry, group: FeedEntry | undefined) =>
  [entry.encoded, entry.description, entry.summary, entry.content, group?.description]
    .map(text)
    .filter(Boolean)
    .join("\n");

const imageFromMarkup = (markup: string, base: string) => {
  const imageTag = markup.match(/<img\b[^>]*>/i)?.[0] ?? "";
  const source = attribute(imageTag, "src") || attribute(imageTag, "data-src");
  return safeUrl(source, base);
};

const mediaImage = (entry: FeedEntry, group: FeedEntry | undefined, base: string) => {
  const candidates = [
    entry.thumbnail,
    group?.thumbnail,
    entry.enclosure,
    entry.content,
    group?.content,
  ];
  for (const candidate of candidates) {
    const url = safeUrl(firstUrl(candidate), base);
    if (url && !/\/v\/[^/]+/.test(new URL(url).pathname)) return url;
  }
  return imageFromMarkup(rawEntryContent(entry, group), base);
};

export function parseFeedEntry(entry: FeedEntry, definition: FeedDefinition): IncomingNewsItem | null {
  const group = entry.group && typeof entry.group === "object" ? entry.group as FeedEntry : undefined;
  const title = clean(text(entry.title));
  const url = safeUrl(entryUrl(entry.link), definition.feedUrl);
  if (!title || !url) return null;

  const rawContent = rawEntryContent(entry, group);
  const content = clean(rawContent);
  const summary = [entry.description, entry.summary, group?.description]
    .map(text)
    .map(clean)
    .find(Boolean) ?? "";
  const videoId = text(entry.videoId).trim();
  const author = entry.author && typeof entry.author === "object" ? entry.author as FeedEntry : undefined;
  const coverUrl = mediaImage(entry, group, definition.feedUrl)
    ?? (videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : null);

  return {
    source: definition.source,
    externalId: text(entry.guid ?? entry.id ?? videoId).trim() || url,
    url,
    title,
    excerpt: (summary || content).slice(0, 1_200),
    content: content.slice(0, 80_000),
    author: clean(text(entry.creator ?? author?.name ?? entry.author)) || null,
    coverUrl,
    videoId: videoId || null,
    publishedAt: safeDate(text(entry.pubDate ?? entry.published ?? entry.updated)),
  };
}

const imageFromMetadata = (markup: string, base: string) => {
  const metaTags = markup.match(/<meta\b[^>]*>/gi) ?? [];
  const preferred = ["og:image", "og:image:url", "twitter:image", "twitter:image:src"];
  for (const key of preferred) {
    const tag = metaTags.find((candidate) => {
      const name = attribute(candidate, "property") || attribute(candidate, "name");
      return name.toLowerCase() === key;
    });
    const url = tag ? safeUrl(attribute(tag, "content"), base) : null;
    if (url) return url;
  }
  return null;
};

async function discoverArticleImage(url: string, signal?: AbortSignal) {
  try {
    const response = await fetchPublic(url, {
      ...(signal ? { signal } : {}),
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9",
        "User-Agent": "Wrapt-TechTLDRs/0.20",
      },
    });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.includes("text/html")) return null;
    const markup = (await readBodyLimited(response, 2_000_000)).toString("utf8");
    return imageFromMetadata(markup, response.url || url);
  } catch {
    return null;
  }
}

export class FeedService {
  constructor(private readonly db: NewsDatabase) {}

  async fetchDefinition(definition: FeedDefinition, outerSignal?: AbortSignal) {
    this.db.upsertSource(definition.source);
    const state = this.db.sourceState(definition.source.id);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.newsFetchTimeoutMilliseconds);
    try {
      const headers: Record<string, string> = {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
        "User-Agent": "Wrapt-TechTLDRs/0.20",
      };
      if (state?.etag) headers["If-None-Match"] = state.etag;
      if (state?.lastModified) headers["If-Modified-Since"] = state.lastModified;
      const signal = outerSignal ? AbortSignal.any([controller.signal, outerSignal]) : controller.signal;
      const response = await fetchPublic(definition.feedUrl, { headers, signal });
      if (response.status === 304) {
        this.db.updateSourceSync(definition.source.id, { error: null });
        return 0;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = (await readBodyLimited(response, 8_000_000)).toString("utf8");
      const parsed = parser.parse(xml) as ParsedFeed;
      const entries = array(parsed.rss?.channel?.item ?? parsed.feed?.entry)
        .slice(0, settings.newsMaxItemsPerSource);
      let count = 0;
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < entries.length) {
          const entry = entries[nextIndex++];
          if (!entry) continue;
          const input = parseFeedEntry(entry, definition);
          if (!input) continue;
          if (!input.coverUrl && !input.videoId) {
            input.coverUrl = await discoverArticleImage(input.url, signal);
          }
          const result = this.db.upsert(input);
          if (result.created) count += 1;
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, entries.length) }, worker));
      this.db.updateSourceSync(definition.source.id, {
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        error: null,
      });
      return count;
    } catch (error) {
      this.db.updateSourceSync(definition.source.id, { error: error instanceof Error ? error.message : "Feedfehler" });
      return 0;
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchHackerNews(outerSignal?: AbortSignal) {
    const source: NewsSource = { id: "hacker-news", name: "Hacker News", homepageUrl: "https://news.ycombinator.com/", kind: "hacker-news", priority: 3 };
    this.db.upsertSource(source);
    let count = 0;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.newsFetchTimeoutMilliseconds);
    const signal = outerSignal ? AbortSignal.any([controller.signal, outerSignal]) : controller.signal;
    try {
      const idsResponse = await fetchPublic("https://hacker-news.firebaseio.com/v0/topstories.json", { signal });
      if (!idsResponse.ok) throw new Error(`HTTP ${idsResponse.status}`);
      const ids = JSON.parse((await readBodyLimited(idsResponse, 1_000_000)).toString("utf8")) as number[];
      const selectedIds = ids.slice(0, Math.min(12, settings.newsMaxItemsPerSource));
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < selectedIds.length) {
          const id = selectedIds[nextIndex++];
          if (!Number.isInteger(id)) continue;
          const itemResponse = await fetchPublic(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal });
          if (!itemResponse.ok) continue;
          const item = JSON.parse((await readBodyLimited(itemResponse, 512_000)).toString("utf8")) as { id: number; title: string; url?: string; by?: string; time: number; text?: string };
          const url = safeUrl(item.url ?? `https://news.ycombinator.com/item?id=${id}`, source.homepageUrl);
          if (!url) continue;
          const result = this.db.upsert({
            source,
            externalId: String(id),
            url,
            title: clean(item.title),
            excerpt: clean(item.text ?? "Diskussion auf Hacker News"),
            content: clean(item.text ?? ""),
            author: item.by ?? null,
            coverUrl: null,
            videoId: null,
            publishedAt: new Date(item.time * 1_000).toISOString(),
          });
          if (result.created) count += 1;
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, selectedIds.length) }, worker));
      this.db.updateSourceSync(source.id, { error: null });
    } catch (error) {
      this.db.updateSourceSync(source.id, { error: error instanceof Error ? error.message : "Hacker-News-Fehler" });
    } finally {
      clearTimeout(timer);
    }
    return count;
  }

  private async backfillCovers(outerSignal?: AbortSignal) {
    const candidates = this.db.coverBackfillCandidates();
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < candidates.length) {
        const candidate = candidates[nextIndex++];
        if (!candidate) continue;
        const timeout = AbortSignal.timeout(7_000);
        const coverUrl = await discoverArticleImage(candidate.url, outerSignal ? AbortSignal.any([timeout, outerSignal]) : timeout);
        if (coverUrl) this.db.updateCover(candidate.id, coverUrl);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, worker));
  }

  async syncAll(signal?: AbortSignal) {
    const results = await Promise.all(feedDefinitions.map((definition) => this.fetchDefinition(definition, signal)));
    const hackerNewsCount = await this.fetchHackerNews(signal);
    await this.backfillCovers(signal);
    return results.reduce((total, result) => total + result, 0) + hackerNewsCount;
  }
}

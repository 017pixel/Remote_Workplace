import { describe, expect, it } from "vitest";
import { parseFeedEntry, type FeedDefinition } from "./feed-service.js";

const definition: FeedDefinition = {
  source: {
    id: "test-feed",
    name: "Test Feed",
    homepageUrl: "https://example.com/",
    kind: "rss",
    priority: 1,
  },
  feedUrl: "https://example.com/feed.xml",
};

describe("parseFeedEntry", () => {
  it("extracts nested media images and text arrays from RSS entries", () => {
    const item = parseFeedEntry({
      title: "Neues Modell",
      link: "https://example.com/model",
      guid: { "#text": "model-1" },
      description: ["Kurzfassung", '<img src="https://cdn.example.com/inline.jpg">Mehr Text'],
      encoded: [{ "#text": "<p>Ausführliche Details</p>" }],
      content: {
        "@_url": "https://cdn.example.com/cover.webp",
        "@_medium": "image",
        thumbnail: { "@_url": "https://cdn.example.com/thumb.jpg" },
      },
      pubDate: "2026-07-16T12:00:00.000Z",
    }, definition);

    expect(item).toMatchObject({
      externalId: "model-1",
      coverUrl: "https://cdn.example.com/cover.webp",
      excerpt: expect.stringContaining("Kurzfassung"),
      content: expect.stringContaining("Ausführliche Details"),
    });
  });

  it("uses the YouTube thumbnail and alternate video link", () => {
    const item = parseFeedEntry({
      id: "yt:video:abc123",
      videoId: "abc123",
      title: "Video",
      link: { "@_rel": "alternate", "@_href": "https://www.youtube.com/watch?v=abc123" },
      group: {
        thumbnail: { "@_url": "https://i.ytimg.com/vi/abc123/hqdefault.jpg" },
        description: "Videobeschreibung",
      },
      published: "2026-07-16T12:00:00.000Z",
    }, { ...definition, source: { ...definition.source, kind: "youtube" } });

    expect(item).toMatchObject({
      url: "https://www.youtube.com/watch?v=abc123",
      videoId: "abc123",
      coverUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
      content: "Videobeschreibung",
    });
  });

  it("does not turn an empty image candidate into the feed URL", () => {
    const item = parseFeedEntry({
      title: "Ohne Bild",
      link: "https://example.com/no-image",
      guid: "no-image",
      pubDate: "2026-07-16T12:00:00.000Z",
    }, definition);

    expect(item?.coverUrl).toBeNull();
  });
});

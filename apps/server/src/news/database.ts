import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { NewsCategory, NewsCollection, NewsItem, NewsSource } from "@workbench/contracts";
import { AppError } from "../utils/errors.js";

export interface IncomingNewsItem {
  source: NewsSource;
  externalId: string;
  url: string;
  title: string;
  excerpt: string;
  content: string;
  author: string | null;
  coverUrl: string | null;
  videoId: string | null;
  publishedAt: string;
}

interface NewsRow {
  id:string; sourceId:string; sourceName:string; sourceUrl:string; sourceKind:NewsSource["kind"]; sourcePriority:number;
  url:string; title:string; tldr:string; longSummary:string; content:string; author:string|null; category:NewsCategory;
  importanceScore:number; importanceReason:string; mediaType:"article"|"video"; coverUrl:string|null; videoId:string|null;
  publishedAt:string; fetchedAt:string; processedAt:string|null; language:string; read:number; aiProcessed:number;
}

export interface NewsListQuery { search?:string; category?:NewsCategory; importance?:"top"|"important"|"relevant"|"more"; mediaType?:"article"|"video"; saved?:boolean; unread?:boolean; collectionId?:string; cursor?:string; limit:number }

const band = (score: number) => score >= 85 ? "top" as const : score >= 65 ? "important" as const : score >= 40 ? "relevant" as const : "more" as const;
const baseCategory = (title: string): NewsCategory => {
  const value = title.toLowerCase();
  if (/model|gpt|claude|gemini|mistral|llama|llm|ki-modell/.test(value)) return "ai-models";
  if (/benchmark|eval|test|leaderboard/.test(value)) return "benchmarks";
  if (/security|vulnerability|attack|privacy|sicher/.test(value)) return "security";
  if (/policy|regulation|government|law|act|politik/.test(value)) return "tech-policy";
  if (/github|developer|api|coding|tool/.test(value)) return "developer-tools";
  if (/open.source|release/.test(value)) return "open-source";
  if (/chip|gpu|cloud|data.center|infrastructure/.test(value)) return "infrastructure";
  if (/paper|research|study/.test(value)) return "research";
  if (/startup|funding|acqui/.test(value)) return "startups";
  return "general";
};

export class NewsDatabase {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
    this.migrate();
  }
  close() { this.db.close(); }
  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS news_sources (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, homepage_url TEXT NOT NULL, kind TEXT NOT NULL,
        priority INTEGER NOT NULL, last_synced_at TEXT, etag TEXT, last_modified TEXT, last_error TEXT
      );
      CREATE TABLE IF NOT EXISTS news_items (
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES news_sources(id), external_id TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
        tldr TEXT NOT NULL DEFAULT '', long_summary TEXT NOT NULL DEFAULT '', author TEXT, category TEXT NOT NULL,
        importance_score INTEGER NOT NULL, importance_reason TEXT NOT NULL, media_type TEXT NOT NULL,
        cover_url TEXT, video_id TEXT, language TEXT NOT NULL DEFAULT 'de', ai_processed INTEGER NOT NULL DEFAULT 0,
        published_at TEXT NOT NULL, fetched_at TEXT NOT NULL, processed_at TEXT,
        UNIQUE(source_id, external_id)
      );
      CREATE INDEX IF NOT EXISTS news_items_feed ON news_items(importance_score DESC, published_at DESC);
      CREATE INDEX IF NOT EXISTS news_items_category ON news_items(category, published_at DESC);
      CREATE TABLE IF NOT EXISTS news_read_state (item_id TEXT PRIMARY KEY REFERENCES news_items(id) ON DELETE CASCADE, is_read INTEGER NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS news_collections (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS news_collection_items (collection_id TEXT NOT NULL REFERENCES news_collections(id) ON DELETE CASCADE, item_id TEXT NOT NULL REFERENCES news_items(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY(collection_id,item_id));
      CREATE TABLE IF NOT EXISTS news_embeddings (item_id TEXT PRIMARY KEY REFERENCES news_items(id) ON DELETE CASCADE, vector_json TEXT NOT NULL, model TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS news_fts USING fts5(item_id UNINDEXED, title, tldr, content, tokenize='unicode61');
      CREATE TABLE IF NOT EXISTS news_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (4, datetime('now'));
    `);
    const mediaMigration = this.db.prepare("SELECT 1 FROM schema_migrations WHERE version=5").get();
    if (!mediaMigration) {
      this.db.exec(`
        UPDATE news_sources SET etag=NULL,last_modified=NULL;
        UPDATE news_items SET cover_url=NULL
        WHERE cover_url LIKE '%/rss%'
          OR cover_url LIKE '%feed.xml%'
          OR cover_url LIKE '%technology-lab%';
        INSERT INTO schema_migrations(version, applied_at) VALUES (5, datetime('now'));
      `);
    }
  }
  sourceState(id: string) { return this.db.prepare("SELECT etag,last_modified lastModified FROM news_sources WHERE id=?").get(id) as {etag:string|null;lastModified:string|null}|undefined; }
  upsertSource(source: NewsSource) { this.db.prepare(`INSERT INTO news_sources(id,name,homepage_url,kind,priority) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,homepage_url=excluded.homepage_url,kind=excluded.kind,priority=excluded.priority`).run(source.id,source.name,source.homepageUrl,source.kind,source.priority); }
  updateSourceSync(id:string, state:{etag?:string|null;lastModified?:string|null;error?:string|null}) { this.db.prepare(`UPDATE news_sources SET last_synced_at=?,etag=COALESCE(?,etag),last_modified=COALESCE(?,last_modified),last_error=? WHERE id=?`).run(new Date().toISOString(),state.etag??null,state.lastModified??null,state.error??null,id); }
  upsert(input: IncomingNewsItem): {id:string;created:boolean} {
    this.upsertSource(input.source);
    const existing = this.db.prepare("SELECT id FROM news_items WHERE url=? OR (source_id=? AND external_id=?)").get(input.url,input.source.id,input.externalId) as {id:string}|undefined;
    const now = new Date().toISOString();
    const category = baseCategory(`${input.title} ${input.excerpt}`);
    const score = ({"ai-models":90,benchmarks:78,"developer-tools":70,security:74,"tech-policy":55,"open-source":68,infrastructure:62,research:60,startups:42,general:35} as Record<NewsCategory,number>)[category] + (input.source.priority === 1 ? 5 : 0);
    const id = existing?.id ?? randomUUID();
    if (existing) {
      this.db.prepare(`UPDATE news_items SET title=?,excerpt=?,content=?,author=?,cover_url=COALESCE(?,cover_url),video_id=COALESCE(?,video_id),media_type=CASE WHEN COALESCE(?,video_id) IS NOT NULL THEN 'video' ELSE media_type END,fetched_at=? WHERE id=?`).run(input.title,input.excerpt,input.content,input.author,input.coverUrl,input.videoId,input.videoId,now,id);
      return {id,created:false};
    }
    this.db.prepare(`INSERT INTO news_items(id,source_id,external_id,url,title,excerpt,content,tldr,long_summary,author,category,importance_score,importance_reason,media_type,cover_url,video_id,language,ai_processed,published_at,fetched_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,input.source.id,input.externalId,input.url,input.title,input.excerpt,input.content,input.excerpt||input.title,input.excerpt||input.content||input.title,input.author,category,Math.min(100,score),"Kategoriebasierte Ersteinstufung",input.videoId?"video":"article",input.coverUrl,input.videoId,"de",0,input.publishedAt,now);
    this.refreshFts(id);
    return {id,created:true};
  }
  updateAi(id:string, value:{title:string;tldr:string;longSummary:string;category:NewsCategory;importanceScore:number;importanceReason:string;language:string;embedding?:number[];embeddingModel?:string}) {
    const now=new Date().toISOString();
    this.db.prepare(`UPDATE news_items SET title=?,tldr=?,long_summary=?,category=?,importance_score=?,importance_reason=?,language=?,ai_processed=1,processed_at=? WHERE id=?`).run(value.title,value.tldr,value.longSummary,value.category,value.importanceScore,value.importanceReason,value.language,now,id);
    if(value.embedding) this.db.prepare(`INSERT INTO news_embeddings(item_id,vector_json,model,updated_at) VALUES(?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET vector_json=excluded.vector_json,model=excluded.model,updated_at=excluded.updated_at`).run(id,JSON.stringify(value.embedding),value.embeddingModel??"unknown",now);
    this.refreshFts(id);
  }
  private refreshFts(id:string) { const row=this.db.prepare("SELECT title,tldr,content FROM news_items WHERE id=?").get(id) as {title:string;tldr:string;content:string}|undefined;if(!row)return;this.db.prepare("DELETE FROM news_fts WHERE item_id=?").run(id);this.db.prepare("INSERT INTO news_fts(item_id,title,tldr,content) VALUES(?,?,?,?)").run(id,row.title,row.tldr,row.content); }
  pending(limit=20) { return this.db.prepare("SELECT id,title,excerpt,content,source_id sourceId FROM news_items WHERE ai_processed=0 ORDER BY importance_score DESC,published_at DESC LIMIT ?").all(limit) as Array<{id:string;title:string;excerpt:string;content:string;sourceId:string}>; }
  coverBackfillCandidates(limit=48) { return this.db.prepare("SELECT id,url FROM news_items WHERE cover_url IS NULL AND video_id IS NULL ORDER BY importance_score DESC,published_at DESC LIMIT ?").all(limit) as Array<{id:string;url:string}>; }
  updateCover(id:string,coverUrl:string) { this.db.prepare("UPDATE news_items SET cover_url=? WHERE id=? AND cover_url IS NULL").run(coverUrl,id); }
  private map(row:NewsRow):NewsItem {
    const collectionIds=(this.db.prepare("SELECT collection_id id FROM news_collection_items WHERE item_id=?").all(row.id) as Array<{id:string}>).map(x=>x.id);
    return {id:row.id,source:{id:row.sourceId,name:row.sourceName,homepageUrl:row.sourceUrl,kind:row.sourceKind,priority:row.sourcePriority},url:row.url,title:row.title,tldr:row.tldr||row.title,longSummary:row.longSummary||row.tldr||row.content,content:row.content,author:row.author,category:row.category,importanceScore:row.importanceScore,importanceBand:band(row.importanceScore),importanceReason:row.importanceReason,mediaType:row.mediaType,coverUrl:row.coverUrl,videoId:row.videoId,publishedAt:row.publishedAt,fetchedAt:row.fetchedAt,processedAt:row.processedAt,language:row.language,read:Boolean(row.read),saved:collectionIds.length>0,collectionIds,aiProcessed:Boolean(row.aiProcessed)};
  }
  private selectSql() { return `SELECT i.id,i.source_id sourceId,s.name sourceName,s.homepage_url sourceUrl,s.kind sourceKind,s.priority sourcePriority,i.url,i.title,i.tldr,i.long_summary longSummary,i.content,i.author,i.category,i.importance_score importanceScore,i.importance_reason importanceReason,i.media_type mediaType,i.cover_url coverUrl,i.video_id videoId,i.published_at publishedAt,i.fetched_at fetchedAt,i.processed_at processedAt,i.language,COALESCE(r.is_read,0) read,i.ai_processed aiProcessed FROM news_items i JOIN news_sources s ON s.id=i.source_id LEFT JOIN news_read_state r ON r.item_id=i.id`; }
  get(id:string) { const row=this.db.prepare(`${this.selectSql()} WHERE i.id=?`).get(id) as NewsRow|undefined;if(!row)throw new AppError(404,"NEWS_NOT_FOUND","Die Nachricht wurde nicht gefunden.");return this.map(row); }
  list(query:NewsListQuery) {
    const where:string[]=[];const params:Array<string|number>=[];
    if(query.search){where.push(`i.id IN (SELECT item_id FROM news_fts WHERE news_fts MATCH ?)`);params.push(query.search.replace(/["']/g," ").trim().split(/\s+/).map(x=>`${x}*`).join(" OR "));}
    if(query.category){where.push("i.category=?");params.push(query.category);} if(query.mediaType){where.push("i.media_type=?");params.push(query.mediaType);}
    if(query.importance){const ranges={top:[85,100],important:[65,84],relevant:[40,64],more:[0,39]}[query.importance];where.push("i.importance_score BETWEEN ? AND ?");params.push(...ranges);}
    if(query.saved) where.push("EXISTS(SELECT 1 FROM news_collection_items ci WHERE ci.item_id=i.id)");
    if(query.unread) where.push("NOT EXISTS(SELECT 1 FROM news_read_state unread_state WHERE unread_state.item_id=i.id AND unread_state.is_read=1)");
    if(query.collectionId){where.push("EXISTS(SELECT 1 FROM news_collection_items ci WHERE ci.item_id=i.id AND ci.collection_id=?)");params.push(query.collectionId);}
    const totalWhere=[...where];const totalParams=[...params];
    if(query.cursor){try{const cursor=JSON.parse(Buffer.from(query.cursor,"base64url").toString("utf8")) as {score:number;date:string};where.push("(i.importance_score < ? OR (i.importance_score = ? AND i.published_at < ?))");params.push(cursor.score,cursor.score,cursor.date);}catch{/* An invalid cursor simply starts from the first page. */}}
    const clause=where.length?` WHERE ${where.join(" AND ")}`:"";
    const rows=this.db.prepare(`${this.selectSql()}${clause} ORDER BY i.importance_score DESC,i.published_at DESC LIMIT ?`).all(...params,query.limit+1) as unknown as NewsRow[];
    const hasMore=rows.length>query.limit;const items=rows.slice(0,query.limit).map(row=>this.map(row));
    const totalClause=totalWhere.length?` WHERE ${totalWhere.join(" AND ")}`:"";const total=(this.db.prepare(`SELECT COUNT(*) count FROM news_items i${totalClause}`).get(...totalParams) as {count:number}).count;
    const last=items.at(-1);const nextCursor=hasMore&&last?Buffer.from(JSON.stringify({score:last.importanceScore,date:last.publishedAt})).toString("base64url"):null;
    return {items,nextCursor,total};
  }
  setRead(id:string,read:boolean){this.get(id);this.db.prepare(`INSERT INTO news_read_state(item_id,is_read,updated_at) VALUES(?,?,?) ON CONFLICT(item_id) DO UPDATE SET is_read=excluded.is_read,updated_at=excluded.updated_at`).run(id,Number(read),new Date().toISOString());return this.get(id);}
  collections():NewsCollection[]{return (this.db.prepare(`SELECT c.id,c.name,c.created_at createdAt,c.updated_at updatedAt,COUNT(ci.item_id) itemCount FROM news_collections c LEFT JOIN news_collection_items ci ON ci.collection_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC`).all() as NewsCollection[]);}
  createCollection(name:string){const now=new Date().toISOString();const id=randomUUID();try{this.db.prepare("INSERT INTO news_collections VALUES(?,?,?,?)").run(id,name,now,now);}catch{throw new AppError(409,"COLLECTION_EXISTS","Eine Sammlung mit diesem Namen existiert bereits.");}return this.collections().find(c=>c.id===id)!;}
  deleteCollection(id:string){const result=this.db.prepare("DELETE FROM news_collections WHERE id=?").run(id);if(result.changes===0)throw new AppError(404,"COLLECTION_NOT_FOUND","Die Sammlung wurde nicht gefunden.");}
  saveToCollections(itemId:string,ids:string[]){this.get(itemId);this.db.exec("BEGIN IMMEDIATE");try{this.db.prepare("DELETE FROM news_collection_items WHERE item_id=?").run(itemId);const insert=this.db.prepare("INSERT INTO news_collection_items VALUES(?,?,?)");for(const id of ids){if(!this.db.prepare("SELECT 1 FROM news_collections WHERE id=?").get(id))throw new AppError(404,"COLLECTION_NOT_FOUND","Eine Sammlung wurde nicht gefunden.");insert.run(id,itemId,new Date().toISOString());this.db.prepare("UPDATE news_collections SET updated_at=? WHERE id=?").run(new Date().toISOString(),id);}this.db.exec("COMMIT");}catch(error){this.db.exec("ROLLBACK");throw error;}return this.get(itemId);}
  relevant(question:string,itemId:string|null,limit=8,queryEmbedding?:number[]){if(itemId)return [this.get(itemId)];const tokens=question.replace(/["']/g," ").trim().split(/\s+/).filter(x=>x.length>2);const ranks=new Map<string,number>();try{if(tokens.length){const ids=this.db.prepare("SELECT item_id id FROM news_fts WHERE news_fts MATCH ? ORDER BY rank LIMIT ?").all(tokens.map(x=>`${x}*`).join(" OR "),limit*3) as Array<{id:string}>;ids.forEach((row,index)=>ranks.set(row.id,(ranks.get(row.id)??0)+1/(60+index)));}}catch{/* Fall back to vector or feed ranking. */}if(queryEmbedding){const norm=Math.sqrt(queryEmbedding.reduce((sum,value)=>sum+value*value,0))||1;const vectors=(this.db.prepare("SELECT item_id id,vector_json vectorJson FROM news_embeddings").all() as Array<{id:string;vectorJson:string}>).map(row=>{const vector=JSON.parse(row.vectorJson) as number[];const denominator=norm*(Math.sqrt(vector.reduce((sum,value)=>sum+value*value,0))||1);const similarity=vector.reduce((sum,value,index)=>sum+value*(queryEmbedding[index]??0),0)/denominator;return{id:row.id,similarity};}).sort((a,b)=>b.similarity-a.similarity).slice(0,limit*3);vectors.forEach((row,index)=>ranks.set(row.id,(ranks.get(row.id)??0)+1/(60+index)));}const ids=[...ranks.entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([id])=>id);return ids.length?ids.map(id=>this.get(id)):this.list({limit}).items;}
  syncState(){const row=this.db.prepare("SELECT MAX(last_synced_at) lastSyncedAt,MAX(last_error) lastError FROM news_sources").get() as {lastSyncedAt:string|null;lastError:string|null};return row;}
}

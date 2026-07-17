import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NewsDatabase } from "./database.js";

const directories:string[]=[];
afterEach(()=>{for(const path of directories.splice(0))rmSync(path,{recursive:true,force:true});});
const setup=()=>{const path=mkdtempSync(join(tmpdir(),"news-db-"));directories.push(path);return new NewsDatabase(join(path,"workbench.sqlite"));};

describe("NewsDatabase",()=>{
  it("imports, searches and ranks news items",()=>{const db=setup();db.upsert({source:{id:"primary",name:"Primary",homepageUrl:"https://example.com",kind:"rss",priority:1},externalId:"1",url:"https://example.com/model",title:"Neues KI-Modell veröffentlicht",excerpt:"Ein neues Modell erreicht starke Benchmarks.",content:"Technische Details und Benchmark-Ergebnisse.",author:null,coverUrl:null,videoId:null,publishedAt:new Date().toISOString()});const result=db.list({search:"Benchmark",limit:10});expect(result.total).toBe(1);expect(result.items[0]).toMatchObject({category:"ai-models",importanceBand:"top",read:false,saved:false});db.close();});
  it("persists read state and named collections",()=>{const db=setup();const inserted=db.upsert({source:{id:"source",name:"Source",homepageUrl:"https://example.com",kind:"atom",priority:2},externalId:"2",url:"https://example.com/tool",title:"Neues Developer Tool",excerpt:"Praktische Hilfe",content:"Details",author:"Autor",coverUrl:null,videoId:null,publishedAt:new Date().toISOString()});const collection=db.createCollection("Später lesen");expect(db.setRead(inserted.id,true).read).toBe(true);const saved=db.saveToCollections(inserted.id,[collection.id]);expect(saved.saved).toBe(true);expect(db.collections()[0]).toMatchObject({name:"Später lesen",itemCount:1});db.close();});
  it("keeps a previously discovered cover when a later feed response omits it",()=>{const db=setup();const base={source:{id:"source",name:"Source",homepageUrl:"https://example.com",kind:"rss" as const,priority:2},externalId:"3",url:"https://example.com/article",title:"Artikel",excerpt:"Kurz",content:"Details",author:null,videoId:null,publishedAt:new Date().toISOString()};const inserted=db.upsert({...base,coverUrl:"https://example.com/cover.jpg"});db.upsert({...base,coverUrl:null});expect(db.get(inserted.id).coverUrl).toBe("https://example.com/cover.jpg");db.close();});
});

import type { NewsCategory, NewsChatMessage, NewsChatResponse, NewsItem } from "@workbench/contracts";
import { settings } from "../config/settings.js";
import type { NewsDatabase, NewsListQuery } from "./database.js";
import { FeedService } from "./feed-service.js";
import { MistralClient } from "./mistral-client.js";

export class NewsService {
  private readonly feeds:FeedService;private readonly mistral=new MistralClient();private timer:NodeJS.Timeout|null=null;private initialTimer:NodeJS.Timeout|null=null;private running=false;private lastError:string|null=null;
  constructor(private readonly db:NewsDatabase){this.feeds=new FeedService(db);}
  start(){if(this.timer)return;this.timer=setInterval(()=>void this.sync(),settings.newsSyncIntervalMilliseconds);this.timer.unref();this.initialTimer=setTimeout(()=>{this.initialTimer=null;void this.sync();},1_000);this.initialTimer.unref();}
  stop(){if(this.timer)clearInterval(this.timer);if(this.initialTimer)clearTimeout(this.initialTimer);this.timer=null;this.initialTimer=null;}
  state(){return {...this.db.syncState(),running:this.running,lastError:this.lastError,aiEnabled:this.mistral.enabled};}
  list(query:NewsListQuery){return {...this.db.list(query),sync:this.state()};}
  async sync(){if(this.running)return false;this.running=true;this.lastError=null;try{await this.feeds.syncAll();await this.processPending();return true;}catch(error){this.lastError=error instanceof Error?error.message:"Synchronisierung fehlgeschlagen";return false;}finally{this.running=false;}}
  private async processPending(){if(!this.mistral.enabled)return;const pending=this.db.pending(24);let index=0;let rateLimited=false;const worker=async()=>{while(index<pending.length&&!rateLimited){const item=pending[index++];if(!item)break;try{const result=await this.mistral.process(item);let embedding:number[]|undefined;try{embedding=await this.mistral.embed(`${result.title_de}\n${result.tldr_de}\n${result.long_summary_de}`);}catch{embedding=undefined;}this.db.updateAi(item.id,{title:result.title_de,tldr:result.tldr_de,longSummary:result.long_summary_de,category:result.category as NewsCategory,importanceScore:result.importance_score,importanceReason:result.importance_reason,language:"de",...(embedding?{embedding,embeddingModel:settings.mistralEmbedModel}:{})});}catch(error){this.lastError=error instanceof Error?error.message:"KI-Verarbeitung fehlgeschlagen";if(/429/.test(this.lastError))rateLimited=true;}}};await Promise.all(Array.from({length:settings.newsAiConcurrency},worker));
  }
  async chat(question:string,itemId:string|null,history:NewsChatMessage[]=[]):Promise<NewsChatResponse>{
    let items:NewsItem[];
    if(itemId){
      const anchor=this.db.get(itemId);
      let anchorEmbedding:number[]|undefined;
      if(this.mistral.enabled){try{anchorEmbedding=await this.mistral.embed(`${anchor.title}\n${anchor.tldr}`);}catch{anchorEmbedding=undefined;}}
      const related=this.db.relevant(`${anchor.title} ${question}`,null,6,anchorEmbedding).filter(item=>item.id!==anchor.id);
      items=[anchor,...related];
    }else{
      let queryEmbedding:number[]|undefined;
      if(this.mistral.enabled){try{queryEmbedding=await this.mistral.embed(question);}catch{queryEmbedding=undefined;}}
      items=this.db.relevant(question,null,10,queryEmbedding);
    }
    if(items.length===0)return{answer:"Im aktuellen Nachrichtenbestand gibt es dafür noch keine belastbare Quelle.",citations:[],model:"retrieval-only",grounded:false};
    if(!this.mistral.enabled)return{answer:items.map((item,index)=>`[${index+1}] ${item.tldr}`).join("\n\n"),citations:items.map(item=>({itemId:item.id,title:item.title,url:item.url,excerpt:item.tldr})),model:"retrieval-only",grounded:true};
    const result=await this.mistral.answer(question,items,history);
    return{answer:result.answer,citations:items.map(item=>({itemId:item.id,title:item.title,url:item.url,excerpt:item.tldr})),model:result.model,grounded:true};
  }
}

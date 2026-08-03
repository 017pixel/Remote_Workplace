import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  createNewsCollectionRequestSchema, markNewsReadRequestSchema, newsCategorySchema, newsChatRequestSchema,
  newsChatResponseSchema, newsCollectionResponseSchema, newsCollectionsResponseSchema, newsItemResponseSchema,
  newsListResponseSchema, newsSyncResponseSchema, saveNewsItemRequestSchema,
} from "@workbench/contracts";
import type { NewsDatabase } from "./database.js";
import type { NewsService } from "./news-service.js";
import { fetchPublic, readBodyLimited } from "../security/public-http.js";

const idParams=z.object({id:z.string().uuid()});
const listQuery=z.object({q:z.string().trim().max(200).optional(),category:newsCategorySchema.optional(),importance:z.enum(["top","important","relevant","more"]).optional(),mediaType:z.enum(["article","video"]).optional(),saved:z.enum(["true","false"]).transform(v=>v==="true").optional(),unread:z.enum(["true","false"]).transform(v=>v==="true").optional(),collectionId:z.string().uuid().optional(),cursor:z.string().optional(),limit:z.coerce.number().int().min(1).max(60).default(30)});
const detectedImageType=(data:Buffer)=>{
  if(data.length>=12&&data.toString("ascii",0,4)==="RIFF"&&data.toString("ascii",8,12)==="WEBP")return"image/webp";
  if(data.length>=8&&data.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return"image/png";
  if(data.length>=3&&data[0]===0xff&&data[1]===0xd8&&data[2]===0xff)return"image/jpeg";
  if(data.length>=6&&["GIF87a","GIF89a"].includes(data.toString("ascii",0,6)))return"image/gif";
  if(data.length>=12&&data.toString("ascii",4,8)==="ftyp"&&/^(avif|avis)$/.test(data.toString("ascii",8,12)))return"image/avif";
  return null;
};

export async function registerNewsRoutes(app:FastifyInstance,services:{news:NewsService;newsDatabase:NewsDatabase}){
  const imageUnavailable=(reply:FastifyReply)=>reply.header("Cache-Control","public, max-age=300").status(404).send();
  app.get("/news",async request=>newsListResponseSchema.parse(services.news.list((()=>{const q=listQuery.parse(request.query);return{limit:q.limit,...(q.q?{search:q.q}:{}),...(q.category?{category:q.category}:{}),...(q.importance?{importance:q.importance}:{}),...(q.mediaType?{mediaType:q.mediaType}:{}),...(q.saved!==undefined?{saved:q.saved}:{}),...(q.unread!==undefined?{unread:q.unread}:{}),...(q.collectionId?{collectionId:q.collectionId}:{}),...(q.cursor?{cursor:q.cursor}:{})};})())));
  app.get("/news/collections",async()=>newsCollectionsResponseSchema.parse({collections:services.newsDatabase.collections()}));
  app.post("/news/collections",async(request,reply)=>reply.status(201).send(newsCollectionResponseSchema.parse({collection:services.newsDatabase.createCollection(createNewsCollectionRequestSchema.parse(request.body).name)})));
  app.delete("/news/collections/:id",async(request,reply)=>{services.newsDatabase.deleteCollection(idParams.parse(request.params).id);return reply.status(204).send();});
  app.post("/news/sync",{config:{rateLimit:{max:3,timeWindow:"1 minute"}}},async()=>{const running=services.news.state().running;if(!running)void services.news.sync();return newsSyncResponseSchema.parse({accepted:!running,running:true});});
  app.post("/news/chat",{config:{rateLimit:{max:12,timeWindow:"1 minute"}}},async request=>newsChatResponseSchema.parse(await services.news.chat(...((input)=>[input.question,input.itemId,input.history,input.model] as const)(newsChatRequestSchema.parse(request.body)))));
  app.get("/news/image/:id",{config:{rateLimit:{max:120,timeWindow:"1 minute"}}},async(request,reply)=>{const item=services.newsDatabase.get(idParams.parse(request.params).id);if(!item.coverUrl)return imageUnavailable(reply);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8_000);try{const response=await fetchPublic(item.coverUrl,{signal:controller.signal,headers:{"User-Agent":"RemoteWorkplace-TechTLDRs/0.20",Accept:"image/avif,image/webp,image/*;q=0.9"}});if(!response.ok)return imageUnavailable(reply);const data=await readBodyLimited(response,6_000_000);if(data.byteLength===0)return imageUnavailable(reply);const detected=detectedImageType(data);if(!detected)return imageUnavailable(reply);const declaredType=response.headers.get("content-type")?.split(";")[0]?.trim()??"";const type=declaredType.startsWith("image/")&&declaredType===detected?declaredType:detected;return reply.header("Cache-Control","public, max-age=86400, stale-while-revalidate=604800").header("Content-Security-Policy","default-src 'none'").header("X-Content-Type-Options","nosniff").type(type).send(data);}catch{return imageUnavailable(reply);}finally{clearTimeout(timer);}});
  app.get("/news/:id",async request=>newsItemResponseSchema.parse({item:services.newsDatabase.get(idParams.parse(request.params).id)}));
  app.patch("/news/:id/read",async request=>newsItemResponseSchema.parse({item:services.newsDatabase.setRead(idParams.parse(request.params).id,markNewsReadRequestSchema.parse(request.body).read)}));
  app.put("/news/:id/collections",async request=>newsItemResponseSchema.parse({item:services.newsDatabase.saveToCollections(idParams.parse(request.params).id,saveNewsItemRequestSchema.parse(request.body).collectionIds)}));
}

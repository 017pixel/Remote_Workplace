import { expect, test } from "@playwright/test";
import { hasPrivateWorkbench, privateWorkbenchReason, workbenchUrl } from "./helpers/environment";

// Braucht synchronisierte News und einen Mistral-Schlüssel für Fragen und Sammlungen.
test.skip(() => !hasPrivateWorkbench, privateWorkbenchReason);

const workbench=workbenchUrl;
const apiOrigin=new URL(workbench).origin;

test("Tech TLDRs supports reading, grounded questions and named collections on desktop",async({page})=>{
  test.setTimeout(90_000);const errors:string[]=[];page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  await page.goto(`${workbench}/tech-tldrs`);await expect(page.getByRole("heading",{name:"Tech TLDRs"})).toBeVisible();await expect(page.locator(".news-bento-card").first()).toBeVisible({timeout:30_000});
  const firstTitle=await page.locator(".news-bento-card h2").first().innerText();
  await page.screenshot({path:"/tmp/tech-tldrs-desktop-feed.png",fullPage:true});
  const bounds=await page.locator(".tech-tldrs-page").evaluate(element=>({client:element.clientWidth,scroll:element.scrollWidth}));expect(bounds.scroll).toBeLessThanOrEqual(bounds.client);
  await page.locator(".news-bento-card .news-card-open").first().click();await expect(page.locator(".news-reader")).toBeVisible();await expect(page.getByText("TLDR",{exact:true})).toBeVisible();
  const desktopChat=page.locator(".news-chat-panel");await expect(desktopChat).toHaveAttribute("aria-hidden","true");await page.getByRole("button",{name:"KI-Chat öffnen"}).click();await expect(desktopChat).toHaveAttribute("aria-hidden","false");
  await page.getByRole("button",{name:"Was ist konkret neu?"}).click();await expect(page.locator(".news-chat-messages .is-answer")).toBeVisible({timeout:45_000});await page.screenshot({path:"/tmp/tech-tldrs-desktop-reader.png",fullPage:true});
  await page.getByRole("button",{name:"Leser schließen"}).click();
  await page.locator(".news-bento-card .news-card-save").first().click();const panel=page.locator(".news-save-panel");await expect(panel).toBeVisible();const collectionName=`E2E ${Date.now()}`;await panel.getByPlaceholder("Neue Sammlung").fill(collectionName);await panel.getByRole("button",{name:/Anlegen/}).click();await expect(panel.getByText(collectionName)).toBeVisible();await panel.getByRole("button",{name:"Auswahl speichern"}).click();
  await page.locator(".news-dynamic-island").getByRole("button",{name:"Gespeichert"}).click();await expect(page.locator(".news-bento-card").first()).toBeVisible();
  const collectionButton=page.locator(".news-collection-rail button").filter({hasText:collectionName});await expect(collectionButton).toBeVisible();await collectionButton.click();await expect(collectionButton).toHaveAttribute("aria-pressed","true");await expect(page.locator(".news-bento-card h2").first()).toHaveText(firstTitle);await page.screenshot({path:"/tmp/tech-tldrs-desktop-saved.png",fullPage:true});
  const collections=await (await page.request.get(`${apiOrigin}/api/v1/news/collections`)).json() as {collections:Array<{id:string;name:string}>};const created=collections.collections.find(item=>item.name===collectionName);if(created)await page.request.delete(`${apiOrigin}/api/v1/news/collections/${created.id}`);
  expect(errors.filter(error=>!/favicon|image/i.test(error))).toEqual([]);
});

test("Tech TLDRs is a snap feed with a thumb-friendly island on mobile",async({page})=>{
  const source=await (await page.request.get(`${apiOrigin}/api/v1/news?limit=1`)).json() as {items:Array<{id:string;title:string;collectionIds:string[]}>};
  const item=source.items[0];expect(item).toBeTruthy();
  const collectionName=`Mobile E2E ${Date.now()}`;
  const createdResponse=await page.request.post(`${apiOrigin}/api/v1/news/collections`,{data:{name:collectionName}});expect(createdResponse.ok()).toBe(true);
  const created=await createdResponse.json() as {collection:{id:string}};
  await page.request.put(`${apiOrigin}/api/v1/news/${item!.id}/collections`,{data:{collectionIds:[...item!.collectionIds,created.collection.id]}});
  try {
    await page.setViewportSize({width:390,height:844});await page.goto(`${workbench}/tech-tldrs`);await expect(page.locator(".news-mobile-feed")).toBeVisible();await expect(page.locator(".news-story").first()).toBeVisible({timeout:30_000});
    await page.screenshot({path:"/tmp/tech-tldrs-mobile-feed.png",fullPage:true});
    const bounds=await page.locator(".tech-tldrs-page").evaluate(element=>({client:element.clientWidth,scroll:element.scrollWidth}));expect(bounds.scroll).toBeLessThanOrEqual(bounds.client);
    const island=page.locator(".news-dynamic-island");await expect(island).toBeVisible();for(const button of await island.getByRole("button").all()){const box=await button.boundingBox();expect(box?.height).toBeGreaterThanOrEqual(44);}
    const switchButtons=island.locator(".news-island-switch > button");const switchWidths=await switchButtons.evaluateAll(buttons=>buttons.map(button=>button.getBoundingClientRect().width));expect(Math.abs((switchWidths[0]??0)-(switchWidths[1]??0))).toBeLessThanOrEqual(1);const islandBox=await island.boundingBox();expect(Math.abs(((islandBox?.x??0)+(islandBox?.width??0)/2)-195)).toBeLessThanOrEqual(1);await expect(island.getByRole("button",{name:"KI-Assistent öffnen"})).toBeVisible();
    const feed=page.locator(".news-mobile-feed");const snap=await feed.evaluate(element=>getComputedStyle(element).scrollSnapType);expect(snap).toContain("y");
    const firstStory=page.locator(".news-story").first();const saveButton=firstStory.getByRole("button",{name:"Speichern"});const saveBox=await saveButton.boundingBox();const saveIconBox=await saveButton.locator("svg").boundingBox();expect(Math.abs(((saveBox?.x??0)+(saveBox?.width??0)/2)-((saveIconBox?.x??0)+(saveIconBox?.width??0)/2))).toBeLessThan(1);
    await firstStory.getByRole("button",{name:"Vollversion"}).click();await expect(page.locator(".news-reader")).toBeVisible();const mobileChat=page.locator(".news-chat-panel");await expect(mobileChat).toHaveAttribute("aria-hidden","true");await page.getByRole("button",{name:"KI-Chat öffnen"}).click();await expect(mobileChat).toHaveAttribute("aria-hidden","false");await expect(page.locator(".news-reader")).toHaveClass(/is-chat-open/);await page.screenshot({path:"/tmp/tech-tldrs-mobile-reader.png",fullPage:true});await page.getByRole("button",{name:"KI-Chat schließen"}).click();await expect(mobileChat).toHaveAttribute("aria-hidden","true");await page.getByRole("button",{name:"Leser schließen"}).click();
    await island.getByRole("button",{name:"Gespeichert"}).click();await expect(island.getByRole("button",{name:"Gespeichert"})).toHaveClass(/is-active/);const collectionButton=page.locator(".news-collection-rail button").filter({hasText:collectionName});await expect(collectionButton).toBeVisible();const collectionBounds=await collectionButton.boundingBox();expect(collectionBounds?.height).toBeGreaterThanOrEqual(44);await collectionButton.click();await expect(collectionButton).toHaveAttribute("aria-pressed","true");await expect(page.locator(".news-story h2").first()).toHaveText(item!.title);await page.screenshot({path:"/tmp/tech-tldrs-mobile-saved.png",fullPage:true});await page.locator(".news-story").first().getByRole("button",{name:"Vollversion"}).click();await expect(page.locator(".news-reader-actions").getByRole("button",{name:"Gespeichert"})).toBeVisible();
  } finally {
    await page.request.put(`${apiOrigin}/api/v1/news/${item!.id}/collections`,{data:{collectionIds:item!.collectionIds}});
    await page.request.delete(`${apiOrigin}/api/v1/news/collections/${created.collection.id}`);
  }
});

test("Tech TLDRs embeds YouTube with a referrer and keeps a direct fallback",async({page})=>{
  await page.goto(`${workbench}/tech-tldrs`);await expect(page.locator(".news-bento-card").first()).toBeVisible({timeout:30_000});await page.getByRole("button",{name:/Filter/}).click();await page.getByLabel("Format").selectOption("video");await expect(page.locator(".news-bento-card").first()).toBeVisible();await page.locator(".news-bento-card .news-card-open").first().click();const frame=page.locator(".news-video iframe");await expect(frame).toBeVisible();await frame.scrollIntoViewIfNeeded();await expect(frame).toHaveAttribute("referrerpolicy","strict-origin-when-cross-origin");await expect(page.getByRole("link",{name:/Video direkt auf YouTube öffnen/})).toBeVisible();await expect.poll(()=>page.frames().some(candidate=>candidate.url().includes("youtube-nocookie.com/embed/")),{timeout:15_000}).toBe(true);
});

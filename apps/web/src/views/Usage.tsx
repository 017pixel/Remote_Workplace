import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscoveredAccount, ManagedAccount, ResetCredit, UsageBreakdown, UsageDailyPoint, UsageForecast, UsageProviderId, UsageRange, UsageWindow } from "@workbench/contracts";
import { ActivityIcon, ClockIcon, CloseIcon, CoinsIcon, DatabaseIcon, EditIcon, EyeIcon, EyeOffIcon, KeyIcon, NutzungIcon, PlusIcon, PowerIcon, RefreshIcon, TrashIcon, UserIcon, WarningIcon } from "../components/icons";
import { useMemo, useState, useEffect } from "react";
import { QueryBoundary } from "../components/QueryBoundary";
import { WebTerminal } from "../components/terminal/WebTerminal";
import { Badge } from "../components/primitives";
import { apiClient } from "../lib/apiClient";
import { formatRelativeTime } from "../lib/format";
import { formatUsageReset } from "../lib/orbitUsage";
import { workbenchQueries } from "../lib/queryOptions";
import { ConfirmDialog, PromptDialog } from "../components/ModalDialog";
import { useRouteActivity } from "../lib/routeActivity";
import { useUsagePreferences } from "../stores/usagePreferences";
import { UsageOverview } from "../components/usage/UsageOverview";

type Tab = "overview"|"history"|"breakdown"|"accounts";
const tabs: Array<{id:Tab;label:string}> = [{id:"overview",label:"Übersicht"},{id:"history",label:"Verlauf"},{id:"breakdown",label:"Projekte & Modelle"},{id:"accounts",label:"Accounts"}];
const ranges: UsageRange[] = ["7d","30d","90d","365d","all"];
const rangeLabel: Record<UsageRange, string> = { "7d": "7 T", "30d": "30 T", "90d": "90 T", "365d": "365 T", all: "Gesamt" };
const number = new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function providerName(provider: UsageProviderId): string {
  return provider === "codex" ? "Codex" : provider === "claude" ? "Claude Code" : "OpenCode Go";
}

function providerStatusLabel(status: "available" | "partial" | "unavailable" | "disabled"): string {
  return status === "available" ? "Aktuell" : status === "partial" ? "Teilweise verfügbar" : status === "disabled" ? "Deaktiviert" : "Nicht verfügbar";
}

function windowLabel(window: UsageWindow): string {
  return window.windowMinutes === 43_200 ? "Monatslimit" : window.label;
}

function WindowCard({window}:{window:UsageWindow}) {
  return <article className="usage-window"><div className="usage-window-heading"><div><p className="usage-window-label">{windowLabel(window)}</p><div className="usage-window-reset"><ClockIcon className="h-3.5 w-3.5"/><span>{formatUsageReset(window.resetsAt)}</span></div></div><div className="usage-window-value"><strong>{window.remainingPercent}%</strong><span>verbleibend</span></div></div><div className="usage-meter" role="progressbar" aria-valuenow={window.usedPercent} aria-valuemin={0} aria-valuemax={100}><span className="usage-meter-fill" style={{width:`${window.usedPercent}%`}}/></div><p className="usage-window-used">{window.usedPercent}% verbraucht</p></article>;
}

function ForecastCard({ forecast }: { forecast: UsageForecast }) {
  const provider = providerName(forecast.providerId);
  const projection = forecast.reachesLimitAt
    ? `Limit voraussichtlich ${new Date(forecast.reachesLimitAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`
    : `${Math.round(Math.min(100, forecast.predictedUsedPercentAtReset))}% Verbrauch zum Reset`;
  return <article><ClockIcon/><div><strong>{provider} · {forecast.accountLabel} · {forecast.windowLabel}</strong><p>{forecast.message}</p><small>{projection} · Reset {new Date(forecast.resetsAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })} · {forecast.sampleCount} Messpunkte · Konfidenz {forecast.confidence}</small></div></article>;
}

function ResetCreditsSection({ creditsByAccount }: { creditsByAccount: Record<string, ResetCredit[]> }) {
  const credits = Object.entries(creditsByAccount).flatMap(([account, accountCredits]) =>
    accountCredits
      .filter((credit) => credit.status.toLowerCase() === "available" && (!credit.expiresAt || Date.parse(credit.expiresAt) > Date.now()))
      .map((credit) => ({ account, credit })),
  );
  if (credits.length === 0) return null;
  return <section className="usage-forecast"><div className="usage-section-heading"><div><p className="usage-provider-kicker">Codex</p><h2>Reset-Guthaben</h2></div><Badge tone={credits.length ? "ok" : "default"}>{credits.length} verfügbar</Badge></div>{credits.length ? credits.map(({account,credit})=><article key={`${account}-${credit.id}`}><CoinsIcon/><div><strong>{credit.title === "Full reset" ? "Vollständiger Limit-Reset" : credit.title} · {account}</strong><p>{credit.description === "Thanks for using Codex! You've been granted one free rate limit reset." ? "Ein kostenloser Reset deiner Codex-Limits." : credit.description}</p><small>Verfügbar · gültig bis {credit.expiresAt?new Date(credit.expiresAt).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"}):"unbekannt"}</small></div></article>):<p className="usage-empty">Aktuell sind keine Reset-Guthaben verfügbar.</p>}</section>;
}

function TokenChart({data}:{data:UsageDailyPoint[]}) {
  // Bei sehr langen Verläufen („Gesamt") werden Tage zu Wochenblöcken gebündelt,
  // damit das Diagramm lesbar bleibt. Die Kennzahlen rechnen mit den Originalwerten.
  const points=useMemo(()=>{if(data.length<=400)return data;const groupSize=Math.ceil(data.length/400);const groups:UsageDailyPoint[]=[];for(let i=0;i<data.length;i+=groupSize){const slice=data.slice(i,i+groupSize);groups.push({date:slice[0]!.date,inputTokens:0,outputTokens:slice.reduce((s,p)=>s+p.outputTokens,0),cacheReadTokens:0,cacheCreationTokens:0,totalTokens:slice.reduce((s,p)=>s+p.totalTokens,0),totalCost:slice.reduce((s,p)=>s+p.totalCost,0)});}return groups;},[data]);
  const width=900,height=260,pad=34,max=Math.max(1,...points.map((d)=>d.totalTokens));
  if (!data.length) return <p className="usage-empty">Für diesen Zeitraum liegen noch keine Tokenwerte vor.</p>;
  const total=data.reduce((sum,point)=>sum+point.totalTokens,0);const cost=data.reduce((sum,point)=>sum+point.totalCost,0);const peak=data.reduce((best,point)=>point.totalTokens>best.totalTokens?point:best,data[0]!);
  return <><div className="usage-chart-summary" aria-label="Zusammenfassung des Tokenverlaufs"><div><span>Gesamt</span><strong>{number.format(total)} Tokens</strong></div><div><span>Kosten</span><strong>{money.format(cost)}</strong></div><div><span>Stärkster Tag</span><strong>{new Date(`${peak.date}T12:00:00`).toLocaleDateString("de-DE",{day:"2-digit",month:"short"})}</strong></div></div><div className="usage-chart-scroll"><svg className="usage-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tokenverbrauch nach Tag"><line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad}/>{points.map((d,i)=>{const slot=(width-pad*2)/points.length;const bar=Math.max(3,slot*.62);const x=pad+i*slot+(slot-bar)/2;const totalHeight=d.totalTokens/max*(height-pad*2);const outputHeight=d.outputTokens/max*(height-pad*2);return <g key={d.date}><rect className="usage-chart-bar" x={x} y={height-pad-totalHeight} width={bar} height={totalHeight}><title>{`${d.date}: ${number.format(d.totalTokens)} Tokens, ${money.format(d.totalCost)}`}</title></rect><rect className="usage-chart-output" x={x} y={height-pad-outputHeight} width={bar} height={outputHeight}/>{(i===0||i===points.length-1||i%Math.ceil(points.length/6)===0)&&<text x={x+bar/2} y={height-10} textAnchor="middle">{d.date.slice(5)}</text>}</g>})}</svg></div></>;
}

function Breakdown({title,items}:{title:string;items:UsageBreakdown[]}) {
  const max=Math.max(1,...items.map((item)=>item.totalTokens));
  return <section className="usage-breakdown"><h2>{title}</h2>{items.length?items.slice(0,12).map((item)=><div className="usage-rank" key={item.id}><div className="usage-rank-head"><span>{item.label}</span><strong>{number.format(item.totalTokens)}</strong></div><div className="usage-rank-track"><span style={{width:`${item.totalTokens/max*100}%`}}/></div><small>{money.format(item.totalCost)} · {item.quality==="exact"?"exakt":item.quality==="derived"?"abgeleitet":"nicht zugeordnet"}</small></div>):<p className="usage-empty">Noch keine aufgeschlüsselten Daten verfügbar.</p>}</section>;
}

const accountGroupOrder: UsageProviderId[] = ["codex", "claude", "opencode"];

function groupedAccounts(accounts: DiscoveredAccount[]): Array<[UsageProviderId, DiscoveredAccount[]]> {
  return accountGroupOrder
    .map((provider) => [provider, accounts.filter((item) => item.provider === provider)] as [UsageProviderId, DiscoveredAccount[]])
    .filter(([, items]) => items.length > 0);
}

function AccountManager() {
  const routeActive=useRouteActivity();
  const client=useQueryClient(); const accounts=useQuery({ ...workbenchQueries.accounts(), enabled: routeActive }); const discovered=useQuery({ ...workbenchQueries.discoveredAccounts(), enabled: routeActive }); const usage=useQuery({ ...workbenchQueries.usage(), refetchInterval: false, enabled: routeActive });
  const [provider,setProvider]=useState<UsageProviderId>("codex"); const [label,setLabel]=useState(""); const [path,setPath]=useState(""); const [login,setLogin]=useState<ManagedAccount|null>(null); const [notice,setNotice]=useState<string|null>(null); const [renameAccount,setRenameAccount]=useState<ManagedAccount|null>(null); const [removeAccount,setRemoveAccount]=useState<ManagedAccount|null>(null);
  const refresh=()=>void Promise.all([client.invalidateQueries({queryKey:["accounts"]}),client.invalidateQueries({queryKey:["usage"]})]);
  const create=useMutation({mutationFn:()=>apiClient.createAccount({provider,label,profilePath:path||undefined,source:"local"}),onSuccess:()=>{setLabel("");setPath("");setNotice("Das lokale Profil wurde registriert.");refresh();},onError:(error)=>setNotice(error instanceof Error?error.message:"Account konnte nicht hinzugefügt werden.")});
  const register=useMutation({mutationFn:(item:DiscoveredAccount)=>apiClient.createAccount({provider:item.provider,label:item.label,profilePath:item.profilePath,source:"local"}),onSuccess:()=>{setNotice("Das gefundene Profil wurde registriert.");refresh();},onError:(error)=>setNotice(error instanceof Error?error.message:"Profil konnte nicht registriert werden.")});
  const startLogin=useMutation({mutationFn:()=>apiClient.startLogin({provider,label}),onSuccess:(value)=>{if(value?.account)setLogin(value.account);setNotice(null);refresh();},onError:(error)=>setNotice(error instanceof Error?error.message:"Anmeldung konnte nicht gestartet werden.")});
  const update=useMutation({mutationFn:({id,body}:{id:string;body:{label?:string;enabled?:boolean}})=>apiClient.updateAccount(id,body),onSuccess:()=>{setNotice("Account wurde aktualisiert.");refresh();},onError:(error)=>setNotice(error instanceof Error?error.message:"Account konnte nicht aktualisiert werden.")});
  const remove=useMutation({mutationFn:(account:ManagedAccount)=>apiClient.deleteAccount(account.id),onSuccess:(_value,account)=>{if(login?.id===account.id)setLogin(null);setNotice(`${account.label} wurde aus Workbench und CodexBar entfernt. Das lokale Profil bleibt erhalten.`);refresh();},onError:(error)=>setNotice(error instanceof Error?error.message:"Account konnte nicht entfernt werden.")});
  const activate=useMutation({mutationFn:(account:ManagedAccount)=>apiClient.activateAccount(account.id),onSuccess:(value,account)=>{const name=value?.account.label??account.label;const tool=providerName(value?.account.provider??account.provider);const detail=value?.migratedTo?` Der Account hat dafür einen eigenen Anmeldespeicher unter ${value.migratedTo} bekommen.`:value?.adoptedInto?` Die zuvor direkt hinterlegten Zugangsdaten wurden nach ${value.adoptedInto} übernommen.`:value?.backupPath?` Die zuvor direkt hinterlegten Zugangsdaten liegen als Sicherung unter ${value.backupPath}.`:"";setNotice(`${name} ist jetzt der aktive ${tool}-Account. Alle neu gestarteten ${tool}-Prozesse nutzen ihn.${detail}`);refresh();},onError:(error)=>setNotice(error instanceof Error?error.message:"Der Account konnte nicht aktiviert werden.")});
  const closeLogin=()=>{setLogin(null);void apiClient.syncUsage().catch(()=>undefined).finally(refresh);};
  const accountById=new Map(accounts.data?.accounts.map((account)=>[account.id,account])??[]);
  // Limits kommen aus dem CodexBar-Abruf und werden über die E-Mail-Adresse dem Profil zugeordnet.
  const windowsByEmail=new Map(usage.data?.providers.flatMap((item)=>item.accounts).filter((item)=>item.email).map((item)=>[item.email!.toLowerCase(),item.windows])??[]);
  return <div className="account-manager">
    <section className="account-add-card"><div><p className="usage-provider-kicker">Hinzufügen</p><h2>Account verbinden</h2><p>Codex, OpenCode und Claude Code verwenden ihre lokalen CLI-Profile. Anmeldedaten bleiben ausschließlich auf diesem Server und werden von CodexBar nur lokal gelesen.</p></div><div className="account-form"><label>Werkzeug<select value={provider} onChange={(e)=>setProvider(e.target.value as typeof provider)}><option value="codex">Codex</option><option value="opencode">OpenCode</option><option value="claude">Claude Code</option></select></label><label>Anzeigename<input value={label} onChange={(e)=>setLabel(e.target.value)} placeholder="Privat, Arbeit …"/></label><label className="account-path">Vorhandener Profilpfad<input value={path} onChange={(e)=>setPath(e.target.value)} placeholder="Optional für lokales Profil"/></label><div className="account-form-actions"><button className="quiet-button" disabled={!label||!path||create.isPending} onClick={()=>create.mutate()}><PlusIcon className="h-4 w-4"/>Profil registrieren</button><button className="quiet-button-primary" disabled={!label||startLogin.isPending} onClick={()=>startLogin.mutate()}><KeyIcon className="h-4 w-4"/>{provider==="codex"?"Mit Gerätecode anmelden":"Neu anmelden"}</button></div></div>{notice?<div className="usage-alert" role="status"><WarningIcon className="h-4 w-4"/>{notice}</div>:null}</section>
    <section className="account-discovery"><div className="usage-section-heading"><div><p className="usage-provider-kicker">Accounts</p><h2>Profile und Verwaltung</h2><p>Je Werkzeug ist genau ein Account serverweit aktiv — bei Codex, Claude Code und OpenCode. Ein Klick auf „Aktivieren“ schaltet um, ohne Abmeldung und ohne neue Anmeldung. Projekte, Sessions und Konfiguration bleiben gemeinsam.</p></div><button className="quiet-button" onClick={()=>void discovered.refetch()}><RefreshIcon className="h-4 w-4"/>Neu suchen</button></div><div className="account-groups">{groupedAccounts(discovered.data?.accounts??[]).map(([provider,items])=><div className="account-group" key={provider}><h3 className="account-group-title">{providerName(provider)}<span>{items.length}</span></h3><div className="managed-account-list">{items.map((item)=>{const account=item.accountId?accountById.get(item.accountId):undefined;const windows=item.email?windowsByEmail.get(item.email.toLowerCase())??[]:[];return <article className={item.active?"managed-account is-active":"managed-account"} key={`${item.provider}:${item.profilePath}`}><header><div className="managed-account-icon"><UserIcon className="h-5 w-5"/></div><div><strong>{item.label}</strong><small>{[providerName(item.provider),item.plan,item.email&&item.email!==item.label?item.email:null,item.registered?(item.source==="login"?"Workbench-Profil":"Lokales Profil"):"gefunden"].filter(Boolean).join(" · ")}</small></div><div className="managed-account-badges">{item.active?<Badge tone="ok">Aktiv</Badge>:null}<Badge tone={item.authenticated?"ok":"warn"}>{item.authenticated?"angemeldet":"Anmeldung fehlt"}</Badge>{item.registered&&!item.enabled?<Badge tone="warn">nicht überwacht</Badge>:null}</div></header><code title={item.profilePath}>{item.profilePath}</code>{windows.length?<div className="managed-account-limits">{windows.map((window)=><div key={window.id}><div><span>{windowLabel(window)}</span><strong>{window.remainingPercent}% frei</strong></div><div className="usage-meter" role="progressbar" aria-valuenow={window.usedPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`${windowLabel(window)} von ${item.label}`}><span className="usage-meter-fill" style={{width:`${window.usedPercent}%`}}/></div></div>)}</div>:null}{account?<div className="managed-account-actions"><button className="managed-account-activate" disabled={item.active||!item.authenticated||activate.isPending} onClick={()=>activate.mutate(account)}><PowerIcon className="h-4 w-4"/>{item.active?"Aktiv":"Aktivieren"}</button><div className="managed-account-tools"><button className="icon-button" title="Umbenennen" aria-label={`${account.label} umbenennen`} onClick={()=>setRenameAccount(account)}><EditIcon className="h-4 w-4"/></button><button className="icon-button" title={account.provider==="codex"?"Geräte-Anmeldung":"Neu anmelden"} aria-label={`${account.label} neu anmelden`} onClick={()=>setLogin(account)}><KeyIcon className="h-4 w-4"/></button><button className="icon-button" title={account.enabled?"Limitüberwachung ausschalten":"Limits überwachen"} aria-label={`Limitüberwachung für ${account.label} ${account.enabled?"ausschalten":"einschalten"}`} onClick={()=>update.mutate({id:account.id,body:{enabled:!account.enabled}})}>{account.enabled?<EyeIcon className="h-4 w-4"/>:<EyeOffIcon className="h-4 w-4"/>}</button><button className="icon-button account-remove-button" title={item.active?"Der aktive Account kann nicht entfernt werden":"Entfernen"} aria-label={`${account.label} entfernen`} disabled={remove.isPending||item.active} onClick={()=>setRemoveAccount(account)}><TrashIcon className="h-4 w-4"/></button></div></div>:<div className="managed-account-actions"><button className="managed-account-activate is-quiet" disabled={register.isPending} onClick={()=>register.mutate(item)}><PlusIcon className="h-4 w-4"/>Registrieren</button></div>}</article>})}</div></div>)}<div className="account-group-empty" hidden={(discovered.data?.accounts.length??0)>0}><UserIcon className="h-5 w-5"/><strong>Keine Profile gefunden</strong><span>Nutze „Neu suchen“ oder verbinde zuerst einen Account.</span></div></div></section>
    {login?<div className="account-login-overlay" role="dialog" aria-modal="true" aria-label={`${login.label} anmelden`}><div className="account-login-sheet"><header><div><p className="usage-provider-kicker">Remote CLI-Anmeldung</p><h2>{login.label}</h2></div><button className="icon-button" onClick={closeLogin} aria-label="Anmeldung schließen"><CloseIcon className="h-5 w-5"/></button></header><p>{login.provider==="codex"?"Kopiere den einmaligen Code aus dem Terminal und öffne die dort genannte Adresse auf deinem eigenen Gerät. Die Anmeldung benötigt keinen localhost-Rückruf auf diesem Server.":"Folge den Anweisungen im Terminal. Nach dem Schließen werden Status und Limits neu geladen."}</p><div className="account-login-terminal"><WebTerminal instanceId={`login-device-v1-${login.id}`} kind={login.provider} mode="login" accountId={login.id} active={routeActive}/></div></div></div>:null}
    <PromptDialog open={Boolean(renameAccount)} title="Account umbenennen" label="Anzeigename" initialValue={renameAccount?.label??""} onConfirm={(value)=>{if(renameAccount)update.mutate({id:renameAccount.id,body:{label:value}})}} onClose={()=>setRenameAccount(null)}/>
    <ConfirmDialog open={Boolean(removeAccount)} title="Account entfernen?" description={`${removeAccount?.label??"Dieser Account"} wird aus Workbench und CodexBar entfernt. Das lokale Profil und seine Anmeldedaten bleiben erhalten.`} confirmLabel="Account entfernen" danger onConfirm={()=>{if(removeAccount)remove.mutate(removeAccount)}} onClose={()=>setRemoveAccount(null)}/>
  </div>;
}

export function Usage() {
  const routeActive=useRouteActivity();
  const [tab,setTab]=useState<Tab>("overview"); const [range,setRange]=useState<UsageRange>("30d"); const client=useQueryClient();
  const query=useQuery({ ...workbenchQueries.usageDashboard(range), enabled: routeActive });
  // Der Sync läuft auf dem Server im Hintergrund: Die Mutation antwortet sofort
  // mit dem aktuellsten Stand, danach lädt die Seite nach, sobald der Refresh fertig ist.
  const [backgroundSyncing,setBackgroundSyncing]=useState(false);
  const sync=useMutation({mutationFn:()=>apiClient.syncUsage(),onSuccess:()=>{void client.invalidateQueries({queryKey:["usage"]});setBackgroundSyncing(true);}});
  useEffect(()=>{
    if(!backgroundSyncing)return;
    let active=true;
    const poll=async()=>{
      try{
        const status=await apiClient.usageSyncStatus();
        if(!status.running){
          if(active){setBackgroundSyncing(false);void client.invalidateQueries({queryKey:["usage"]});}
        }
      }catch{/* beim nächsten Poll erneut versuchen */}
    };
    const timer=setInterval(()=>void poll(),2500);
    void poll();
    return ()=>{active=false;clearInterval(timer);};
  },[backgroundSyncing,client]);
  const timelineQuery=useQuery({ ...workbenchQueries.usageTimeline(), enabled: routeActive && tab==="overview" });
  const prefs=useUsagePreferences();
  const activeDays=useMemo(()=>query.data?.daily.filter((d)=>d.totalTokens>0).length??0,[query.data]);
  return <div className="page-scroll"><div className="page-frame usage-page"><header className="usage-hero"><p className="usage-eyebrow">Lokale Nutzungsanalyse</p><h1>Nutzung und Limits</h1><p>Tokens, Kosten, Projekte und Limits aus CodexBar – historisch gespeichert und mit nachvollziehbaren Prognosen.</p></header><nav className="usage-tabs" aria-label="Nutzungsbereiche">{tabs.map((item)=><button className={tab===item.id?"is-active":""} key={item.id} onClick={()=>setTab(item.id)}>{item.label}</button>)}</nav>
  {tab!=="accounts"?<QueryBoundary {...query} loadingLabel="Statistiken werden geladen…">{(data)=><><section className="usage-toolbar"><div><DatabaseIcon className="h-4 w-4"/><span>{data.live.lastSuccessfulFetchAt?`Datenstand ${formatRelativeTime(data.live.lastSuccessfulFetchAt)}`:"Noch kein erfolgreicher Abruf"}</span></div><div className="usage-range">{ranges.map((item)=><button className={range===item?"is-active":""} key={item} onClick={()=>setRange(item)}>{rangeLabel[item]}</button>)}</div><button className="quiet-button" disabled={sync.isPending||backgroundSyncing} aria-busy={sync.isPending||backgroundSyncing} onClick={()=>sync.mutate()}><RefreshIcon className="h-4 w-4"/>{sync.isPending||backgroundSyncing?"Synchronisiert…":"Synchronisieren"}</button></section>
  {tab==="overview"?<>{prefs.showUsageKpis?<section className="usage-kpis"><article><ActivityIcon/><span>Tokens heute</span><strong>{number.format(data.totals.todayTokens)}</strong></article><article><DatabaseIcon/><span>Tokens im Zeitraum</span><strong>{number.format(data.totals.totalTokens)}</strong></article><article><CoinsIcon/><span>Kosten im Zeitraum</span><strong>{money.format(data.totals.totalCost)}</strong></article><article><NutzungIcon/><span>Aktive Tage</span><strong>{activeDays}</strong></article></section>:null}<QueryBoundary {...timelineQuery} loadingLabel="Limits werden geladen…">{(timeline)=><UsageOverview timeline={timeline}/>}</QueryBoundary>{prefs.showDetailedProviderCards?<div className="usage-providers">{data.live.providers.filter((provider)=>provider.status!=="disabled").map((provider)=><section className="usage-provider" key={provider.providerId}><header className="usage-provider-heading"><div><p className="usage-provider-kicker">{providerStatusLabel(provider.status)}</p><h2 className="usage-provider-title">{provider.providerName}</h2></div><Badge tone={provider.status==="available"?"ok":provider.status==="partial"?"warn":provider.status==="disabled"?"default":"bad"}>{provider.accounts.length} Accounts</Badge></header>{provider.error?provider.status==="disabled"?<p className="usage-disabled-note"><EyeOffIcon className="h-4 w-4"/>{provider.error.message}</p>:<div className="usage-alert"><WarningIcon className="h-4 w-4"/>{provider.error.message}</div>:null}<div className="usage-accounts">{provider.accounts.map((account)=><section className="usage-account" key={account.id}><header className="usage-account-heading"><p className="usage-account-name">{account.email??account.label}</p>{account.plan?<Badge>{account.plan}</Badge>:null}</header><div className="usage-windows">{account.windows.map((window)=><WindowCard key={window.id} window={window}/>)}</div></section>)}</div></section>)}</div>:null}{prefs.showForecasts?<section className="usage-forecast"><div className="usage-section-heading"><div><p className="usage-provider-kicker">Vorausschau</p><h2>Limitprognosen</h2></div></div>{data.forecasts.length?data.forecasts.map((forecast)=><ForecastCard key={`${forecast.providerId}-${forecast.accountId}-${forecast.windowId}`} forecast={forecast}/>):<p className="usage-empty">Mindestens drei Messpunkte desselben aktuellen Limitfensters werden für eine Prognose benötigt.</p>}</section>:null}{prefs.showResetCredits?<ResetCreditsSection creditsByAccount={data.resetCredits}/>:null}</>:null}
  {tab==="history"?<section className="usage-chart-card"><div className="usage-section-heading"><div><p className="usage-provider-kicker">Zeitreihe</p><h2>Tokens nach Tag</h2></div><div className="usage-chart-legend"><span>Gesamt</span><span>Output</span></div></div><TokenChart data={data.daily}/><div className="usage-projection"><span>30-Tage-Hochrechnung</span><strong>{number.format(data.totals.projected30DayTokens)} Tokens · {money.format(data.totals.projected30DayCost)}</strong></div></section>:null}
  {tab==="breakdown"?<div className="usage-breakdown-grid"><Breakdown title={data.projectRange==="all"?"Projekte (alle Zeit)":`Projekte (letzte ${data.projectRange.replace("d", " Tage")})`} items={data.projects}/><Breakdown title={range==="all"?"Modelle (alle Zeit)":"Modelle im gewählten Zeitraum"} items={data.models}/></div>:null}</>}</QueryBoundary>:<AccountManager/>}</div></div>;
}

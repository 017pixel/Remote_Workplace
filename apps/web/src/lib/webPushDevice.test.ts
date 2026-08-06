// @vitest-environment jsdom
import { notificationSettingsResponseSchema, type NotificationSettingsResponse } from "@workbench/contracts";
import { describe, expect, it, vi } from "vitest";
import { base64UrlBytes, WebPushDeviceClient, type WebPushEnvironment, type WebPushServer } from "./webPushDevice";

const vapidPublicKey = "AQIDBA";

function settings(): NotificationSettingsResponse {
  return notificationSettingsResponseSchema.parse({
    preferences: { pushEnabled: true }, pushSupported: true, vapidPublicKey, subscriptionCount: 0, serverPushEnabled: true,
  });
}

function pushSubscription(name: string, key = vapidPublicKey, unsubscribe = vi.fn(async () => true)) {
  const endpoint = `https://push.example/${name}`;
  const subscription = {
    endpoint,
    expirationTime: null,
    options: { userVisibleOnly: true, applicationServerKey: base64UrlBytes(key).buffer },
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: `key-${name}`, auth: `auth-${name}` } }),
    unsubscribe,
  } as unknown as PushSubscription;
  return { subscription, unsubscribe };
}

function environment(options: {
  permission?: NotificationPermission;
  subscription?: PushSubscription | null;
  replacement?: PushSubscription;
  secureContext?: boolean;
  serviceWorkerSupported?: boolean;
  pushManagerSupported?: boolean;
  notificationsSupported?: boolean;
  appleMobile?: boolean;
  standalone?: boolean;
  requestPermission?: NotificationPermission;
} = {}) {
  const getSubscription = vi.fn(async () => options.subscription ?? null);
  const subscribe = vi.fn(async () => options.replacement ?? pushSubscription("created").subscription);
  const requestPermission = vi.fn(async () => options.requestPermission ?? "granted" as NotificationPermission);
  const value: WebPushEnvironment = {
    secureContext: options.secureContext ?? true,
    serviceWorkerSupported: options.serviceWorkerSupported ?? true,
    pushManagerSupported: options.pushManagerSupported ?? true,
    notificationsSupported: options.notificationsSupported ?? true,
    appleMobile: options.appleMobile ?? false,
    standalone: options.standalone ?? true,
    permission: () => options.permission ?? "granted",
    requestPermission,
    serviceWorkerReady: async () => ({ pushManager: { getSubscription, subscribe } }) as unknown as ServiceWorkerRegistration,
    userAgent: options.appleMobile ? "Mozilla/5.0 (iPad)" : "Mozilla/5.0 (Linux; Android 16)",
    platform: options.appleMobile ? "iPad" : "Linux armv8l",
  };
  return { value, getSubscription, subscribe, requestPermission };
}

function server(options: { registerError?: boolean; unregisterError?: boolean } = {}) {
  const register = vi.fn(async () => { if (options.registerError) throw new Error("Server nicht erreichbar"); });
  const unregister = vi.fn(async () => { if (options.unregisterError) throw new Error("Server nicht erreichbar"); });
  const test = vi.fn(async () => undefined);
  const value: WebPushServer = { settings: async () => settings(), register, unregister, test };
  return { value, register, unregister, test };
}

describe("Web-Push-Geräteclient", () => {
  it("erkennt Browser ohne Push-Unterstützung", async () => {
    const browser = environment({ pushManagerSupported: false });
    await expect(new WebPushDeviceClient(browser.value, server().value).inspect(settings())).resolves.toMatchObject({ status: "unsupported" });
  });

  it("fordert auf iPadOS außerhalb des Standalone-Modus zuerst die Installation", async () => {
    const browser = environment({ appleMobile: true, standalone: false, pushManagerSupported: false, permission: "default" });
    const result = await new WebPushDeviceClient(browser.value, server().value).activate(settings());
    expect(result.status).toBe("ipad-install-required");
    expect(browser.requestPermission).not.toHaveBeenCalled();
    expect(browser.subscribe).not.toHaveBeenCalled();
  });

  it("unterscheidet nicht angefragte und verweigerte Berechtigungen", async () => {
    await expect(new WebPushDeviceClient(environment({ permission: "default" }).value, server().value).inspect(settings())).resolves.toMatchObject({ status: "permission-default" });
    await expect(new WebPushDeviceClient(environment({ permission: "denied" }).value, server().value).inspect(settings())).resolves.toMatchObject({ status: "permission-denied" });
  });

  it("synchronisiert ein bestehendes lokales Abo idempotent mit dem Backend", async () => {
    const local = pushSubscription("existing");
    const backend = server();
    const result = await new WebPushDeviceClient(environment({ subscription: local.subscription }).value, backend.value).inspect(settings());
    expect(result).toMatchObject({ status: "active-synced", endpoint: local.subscription.endpoint });
    expect(backend.register).toHaveBeenCalledOnce();
  });

  it("aktiviert ein zweites Gerät ohne globale Einstellungen oder andere Endpoints zu verändern", async () => {
    const created = pushSubscription("ipad");
    const browser = environment({ permission: "default", requestPermission: "granted", replacement: created.subscription });
    const backend = server();
    const result = await new WebPushDeviceClient(browser.value, backend.value).activate(settings());
    expect(result.status).toBe("active-synced");
    expect(browser.requestPermission).toHaveBeenCalledOnce();
    expect(backend.register).toHaveBeenCalledWith(expect.objectContaining({ endpoint: created.subscription.endpoint }));
    expect(backend.unregister).not.toHaveBeenCalled();
  });

  it("deaktiviert nur das aktuelle lokale Gerät und dessen Endpoint", async () => {
    const local = pushSubscription("android");
    const backend = server();
    const result = await new WebPushDeviceClient(environment({ subscription: local.subscription }).value, backend.value).deactivate(settings());
    expect(result.status).toBe("inactive");
    expect(local.unsubscribe).toHaveBeenCalledOnce();
    expect(backend.unregister).toHaveBeenCalledWith(local.subscription.endpoint);
  });

  it("repariert einen fehlenden Backend-Eintrag beim Öffnen der Einstellungen", async () => {
    const local = pushSubscription("repair");
    const backend = server();
    await new WebPushDeviceClient(environment({ subscription: local.subscription }).value, backend.value).inspect(settings());
    expect(backend.register).toHaveBeenCalledWith(expect.objectContaining({ endpoint: local.subscription.endpoint }));
  });

  it("ersetzt ein Abo, wenn sich der öffentliche VAPID-Schlüssel geändert hat", async () => {
    const previous = pushSubscription("old", "BQYHCA");
    const replacement = pushSubscription("new");
    const browser = environment({ subscription: previous.subscription, replacement: replacement.subscription });
    const backend = server();
    const result = await new WebPushDeviceClient(browser.value, backend.value).inspect(settings());
    expect(result).toMatchObject({ status: "active-synced", endpoint: replacement.subscription.endpoint });
    expect(previous.unsubscribe).toHaveBeenCalledOnce();
    expect(backend.unregister).toHaveBeenCalledWith(previous.subscription.endpoint);
    expect(backend.register).toHaveBeenCalledWith(expect.objectContaining({ endpoint: replacement.subscription.endpoint }));
  });

  it("zeigt einen Server-Upsert-Fehler bei weiter vorhandenem lokalen Abo", async () => {
    const local = pushSubscription("unsynced");
    const result = await new WebPushDeviceClient(environment({ subscription: local.subscription }).value, server({ registerError: true }).value).inspect(settings());
    expect(result).toMatchObject({ status: "active-unsynced", endpoint: local.subscription.endpoint });
  });

  it("behält das Gerät bei einem Unsubscribe-Fehler als aktiv markiert", async () => {
    const failedUnsubscribe = vi.fn(async () => { throw new Error("Browserfehler"); });
    const local = pushSubscription("unsubscribe-error", vapidPublicKey, failedUnsubscribe);
    const backend = server();
    const result = await new WebPushDeviceClient(environment({ subscription: local.subscription }).value, backend.value).deactivate(settings());
    expect(result.status).toBe("active-unsynced");
    expect(backend.unregister).not.toHaveBeenCalled();
  });
});

import type { NotificationSettingsResponse, PushSubscriptionRegistration } from "@wrapt/contracts";
import { apiClient, ApiClientError } from "./apiClient";

export type WebPushDeviceStatus =
  | "checking"
  | "unsupported"
  | "ipad-install-required"
  | "service-worker-error"
  | "permission-default"
  | "permission-denied"
  | "inactive"
  | "inactive-server-error"
  | "active-synced"
  | "active-unsynced";

export interface WebPushDeviceState {
  status: WebPushDeviceStatus;
  permission: NotificationPermission | "unsupported";
  endpoint: string | null;
  message: string;
}

export interface WebPushEnvironment {
  secureContext: boolean;
  serviceWorkerSupported: boolean;
  pushManagerSupported: boolean;
  notificationsSupported: boolean;
  appleMobile: boolean;
  standalone: boolean;
  permission(): NotificationPermission | "unsupported";
  requestPermission(): Promise<NotificationPermission>;
  serviceWorkerReady(): Promise<ServiceWorkerRegistration>;
  userAgent: string;
  platform: string;
}

export interface WebPushServer {
  settings(): Promise<NotificationSettingsResponse>;
  register(subscription: PushSubscriptionRegistration): Promise<void>;
  unregister(endpoint: string): Promise<void>;
  test(endpoint: string): Promise<void>;
}

function isAppleMobileDevice(navigatorValue: Navigator): boolean {
  return /iPad|iPhone|iPod/.test(navigatorValue.userAgent)
    || (navigatorValue.userAgent.includes("Mac") && navigatorValue.maxTouchPoints > 1);
}

function standaloneMode(windowValue: Window, navigatorValue: Navigator): boolean {
  const appleNavigator = navigatorValue as Navigator & { standalone?: boolean };
  return windowValue.matchMedia("(display-mode: standalone)").matches || appleNavigator.standalone === true;
}

function readyWithTimeout(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error("Der Service Worker ist noch nicht bereit.")), 10_000);
  });
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export function browserWebPushEnvironment(): WebPushEnvironment {
  return {
    secureContext: window.isSecureContext,
    serviceWorkerSupported: "serviceWorker" in navigator,
    pushManagerSupported: "PushManager" in window,
    notificationsSupported: "Notification" in window,
    appleMobile: isAppleMobileDevice(navigator),
    standalone: standaloneMode(window, navigator),
    permission: () => "Notification" in window ? Notification.permission : "unsupported",
    requestPermission: () => Notification.requestPermission(),
    serviceWorkerReady: readyWithTimeout,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
  };
}

export const browserWebPushServer: WebPushServer = {
  settings: () => apiClient.notificationSettings(),
  register: async (subscription) => { await apiClient.subscribePush(subscription); },
  unregister: async (endpoint) => {
    try { await apiClient.unsubscribePush(endpoint); }
    catch (error) { if (!(error instanceof ApiClientError) || error.status !== 404) throw error; }
  },
  test: async (endpoint) => { await apiClient.testPush(endpoint); },
};

export function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function subscriptionUsesVapidKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const expected = base64UrlBytes(publicKey);
  const actual = new Uint8Array(current);
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function state(status: WebPushDeviceStatus, permission: WebPushDeviceState["permission"], endpoint: string | null, message: string): WebPushDeviceState {
  return { status, permission, endpoint, message };
}

function deviceName(environment: WebPushEnvironment): string {
  if (environment.appleMobile) return "iPad oder iPhone";
  if (/Android/i.test(environment.userAgent)) return "Android-Gerät";
  return "Browsergerät";
}

function subscriptionRegistration(subscription: PushSubscription, environment: WebPushEnvironment): PushSubscriptionRegistration {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error("Das lokale Push-Abo ist unvollständig.");
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { p256dh, auth },
    deviceName: deviceName(environment),
    platform: environment.platform || "unbekannt",
    userAgent: environment.userAgent,
  };
}

export class WebPushDeviceClient {
  constructor(
    private readonly environment: WebPushEnvironment = browserWebPushEnvironment(),
    private readonly server: WebPushServer = browserWebPushServer,
  ) {}

  async inspect(settings: NotificationSettingsResponse): Promise<WebPushDeviceState> {
    const unavailable = this.unavailableState(settings);
    if (unavailable) return unavailable;
    const permission = this.environment.permission();
    let registration: ServiceWorkerRegistration;
    try { registration = await this.environment.serviceWorkerReady(); }
    catch {
      if (permission === "denied") return state("permission-denied", permission, null, "System-Benachrichtigungen sind in den Geräte- oder Browsereinstellungen blockiert.");
      return state("service-worker-error", permission, null, "Der Service Worker ist noch nicht bereit. Lade die App neu und versuche es erneut.");
    }
    const subscription = await registration.pushManager.getSubscription();
    if (permission === "denied") return state("permission-denied", permission, subscription?.endpoint ?? null, "System-Benachrichtigungen sind in den Geräte- oder Browsereinstellungen blockiert.");
    if (!subscription) {
      if (permission === "default") return state("permission-default", permission, null, "Die Berechtigung wurde auf diesem Gerät noch nicht angefragt.");
      return state("inactive", permission, null, "Dieses Gerät besitzt kein lokales Push-Abo.");
    }
    if (permission !== "granted") return state("active-unsynced", permission, subscription.endpoint, "Ein lokales Push-Abo ist vorhanden, die Systemberechtigung ist aber nicht aktiv.");
    if (!subscriptionUsesVapidKey(subscription, settings.vapidPublicKey!)) {
      return this.replaceSubscription(settings, registration, subscription);
    }
    try {
      await this.server.register(subscriptionRegistration(subscription, this.environment));
      return state("active-synced", permission, subscription.endpoint, "Dieses Gerät ist lokal abonniert und mit dem Server synchronisiert.");
    } catch {
      return state("active-unsynced", permission, subscription.endpoint, "Das lokale Push-Abo ist aktiv, konnte aber nicht mit dem Server synchronisiert werden.");
    }
  }

  async activate(settings: NotificationSettingsResponse): Promise<WebPushDeviceState> {
    const unavailable = this.unavailableState(settings);
    if (unavailable) return unavailable;
    let permission = this.environment.permission();
    if (permission === "default") permission = await this.environment.requestPermission();
    if (permission !== "granted") return state("permission-denied", permission, null, "System-Benachrichtigungen wurden nicht erlaubt. Ändere die Freigabe in den Geräte- oder Browsereinstellungen.");
    let registration: ServiceWorkerRegistration;
    try { registration = await this.environment.serviceWorkerReady(); }
    catch { return state("service-worker-error", permission, null, "Der Service Worker ist noch nicht bereit. Lade die App neu und versuche es erneut."); }
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !subscriptionUsesVapidKey(subscription, settings.vapidPublicKey!)) {
      return this.replaceSubscription(settings, registration, subscription);
    }
    try {
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlBytes(settings.vapidPublicKey!),
      });
    } catch {
      return state("inactive", permission, null, "Der Browser konnte kein lokales Push-Abo anlegen.");
    }
    try {
      await this.server.register(subscriptionRegistration(subscription, this.environment));
      return state("active-synced", permission, subscription.endpoint, "System-Benachrichtigungen sind auf diesem Gerät aktiv.");
    } catch {
      return state("active-unsynced", permission, subscription.endpoint, "Das lokale Push-Abo wurde angelegt, der Server konnte es aber nicht speichern. Beim nächsten Öffnen wird die Synchronisierung erneut versucht.");
    }
  }

  async deactivate(settings: NotificationSettingsResponse): Promise<WebPushDeviceState> {
    const unavailable = this.unavailableState(settings);
    if (unavailable) return unavailable;
    const permission = this.environment.permission();
    let registration: ServiceWorkerRegistration;
    try { registration = await this.environment.serviceWorkerReady(); }
    catch { return state("service-worker-error", permission, null, "Der Service Worker ist noch nicht bereit. Lade die App neu und versuche es erneut."); }
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return state(permission === "default" ? "permission-default" : "inactive", permission, null, "Dieses Gerät besitzt kein lokales Push-Abo.");
    const endpoint = subscription.endpoint;
    try {
      if (!await subscription.unsubscribe()) return state("active-unsynced", permission, endpoint, "Das lokale Push-Abo konnte nicht entfernt werden und bleibt aktiv.");
    } catch {
      return state("active-unsynced", permission, endpoint, "Das lokale Push-Abo konnte nicht entfernt werden und bleibt möglicherweise aktiv.");
    }
    try {
      await this.server.unregister(endpoint);
      return state("inactive", permission, null, "System-Benachrichtigungen sind nur auf diesem Gerät deaktiviert.");
    } catch {
      return state("inactive-server-error", permission, null, "Das Gerät ist lokal deaktiviert. Der alte Servereintrag konnte noch nicht entfernt werden und wird bei der nächsten fehlgeschlagenen Zustellung bereinigt.");
    }
  }

  async sendTest(endpoint: string): Promise<void> { await this.server.test(endpoint); }

  private unavailableState(settings: NotificationSettingsResponse): WebPushDeviceState | null {
    if (this.environment.appleMobile && !this.environment.standalone) {
      return state("ipad-install-required", this.environment.permission(), null, "Auf iPadOS: Teilen, Zum Home-Bildschirm wählen und die installierte App vom Home-Bildschirm öffnen.");
    }
    if (!this.environment.secureContext) return state("unsupported", this.environment.permission(), null, "Web Push benötigt eine sichere HTTPS-Verbindung.");
    if (!this.environment.serviceWorkerSupported || !this.environment.pushManagerSupported || !this.environment.notificationsSupported || !settings.pushSupported || !settings.vapidPublicKey) {
      return state("unsupported", this.environment.permission(), null, "Dieser Browser unterstützt die benötigten Push-, Notification- oder Service-Worker-Funktionen nicht.");
    }
    return null;
  }

  private async replaceSubscription(
    settings: NotificationSettingsResponse,
    registration: ServiceWorkerRegistration,
    previous: PushSubscription,
  ): Promise<WebPushDeviceState> {
    const permission = this.environment.permission();
    const previousEndpoint = previous.endpoint;
    try {
      if (!await previous.unsubscribe()) return state("active-unsynced", permission, previousEndpoint, "Der öffentliche VAPID-Schlüssel hat sich geändert, das alte lokale Abo konnte aber nicht ersetzt werden.");
    } catch {
      return state("active-unsynced", permission, previousEndpoint, "Der öffentliche VAPID-Schlüssel hat sich geändert, das alte lokale Abo konnte aber nicht entfernt werden.");
    }
    try { await this.server.unregister(previousEndpoint); } catch { /* Der neue Endpoint wird trotzdem angelegt und separat synchronisiert. */ }
    let replacement: PushSubscription;
    try {
      replacement = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlBytes(settings.vapidPublicKey!) });
    } catch {
      return state("inactive", permission, null, "Der VAPID-Schlüssel hat sich geändert, das neue lokale Push-Abo konnte aber nicht angelegt werden.");
    }
    try {
      await this.server.register(subscriptionRegistration(replacement, this.environment));
      return state("active-synced", permission, replacement.endpoint, "Das Push-Abo wurde auf den aktuellen VAPID-Schlüssel umgestellt und synchronisiert.");
    } catch {
      return state("active-unsynced", permission, replacement.endpoint, "Das Push-Abo wurde lokal erneuert, konnte aber nicht mit dem Server synchronisiert werden.");
    }
  }
}

export async function synchronizeExistingPushDevice(): Promise<void> {
  const environment = browserWebPushEnvironment();
  if (!environment.secureContext || !environment.serviceWorkerSupported || !environment.pushManagerSupported || !environment.notificationsSupported) return;
  if (environment.appleMobile && !environment.standalone) return;
  if (environment.permission() !== "granted") return;
  try {
    const registration = await environment.serviceWorkerReady();
    if (!await registration.pushManager.getSubscription()) return;
    const server = browserWebPushServer;
    const settings = await server.settings();
    await new WebPushDeviceClient(environment, server).inspect(settings);
  } catch {
    // Leichte Start-Synchronisierung: Fehler zeigt die Einstellungsseite verständlich an.
  }
}

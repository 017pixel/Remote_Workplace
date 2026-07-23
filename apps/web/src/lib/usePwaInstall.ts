import { createContext, createElement, type ReactNode, useContext, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isAppleMobileDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
}

interface PwaInstallState {
  install: () => Promise<void>;
  isAppleMobile: boolean;
  isInstalled: boolean;
  canInstall: boolean;
  updateAvailable: boolean;
  applyUpdate: () => Promise<void>;
}

const PwaInstallContext = createContext<PwaInstallState | null>(null);

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const isAppleMobile = isAppleMobileDevice();

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const appleNavigator = window.navigator as Navigator & { standalone?: boolean };
    const updateInstalledState = () => setIsInstalled(standalone.matches || appleNavigator.standalone === true);
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    updateInstalledState();
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    const onAppInstalled = () => {
      setInstallPrompt(null);
      updateInstalledState();
    };

    window.addEventListener("appinstalled", onAppInstalled);
    standalone.addEventListener("change", updateInstalledState);

    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      standalone.removeEventListener("change", updateInstalledState);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    const inspect = () => {
      if (registration?.waiting) setUpdateAvailable(true);
      const installing = registration?.installing;
      if (installing) installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) setUpdateAvailable(true);
      });
    };
    void navigator.serviceWorker.ready.then((value) => {
      registration = value;
      inspect();
      registration.addEventListener("updatefound", inspect);
    });
    return () => registration?.removeEventListener("updatefound", inspect);
  }, []);

  const install = async () => {
    if (installPrompt === null) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(null);
  };

  const applyUpdate = async () => {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    if (!registration.waiting) { await registration.update(); return; }
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    }, { once: true });
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  };

  return createElement(
    PwaInstallContext.Provider,
    { value: { install, isAppleMobile, isInstalled, canInstall: installPrompt !== null, updateAvailable, applyUpdate } },
    children,
  );
}

export function usePwaInstall() {
  const state = useContext(PwaInstallContext);
  if (state === null) throw new Error("usePwaInstall muss innerhalb von PwaInstallProvider verwendet werden.");
  return state;
}

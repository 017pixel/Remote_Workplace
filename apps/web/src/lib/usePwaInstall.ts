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
}

const PwaInstallContext = createContext<PwaInstallState | null>(null);

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
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

  const install = async () => {
    if (installPrompt === null) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(null);
  };

  return createElement(
    PwaInstallContext.Provider,
    { value: { install, isAppleMobile, isInstalled, canInstall: installPrompt !== null } },
    children,
  );
}

export function usePwaInstall() {
  const state = useContext(PwaInstallContext);
  if (state === null) throw new Error("usePwaInstall muss innerhalb von PwaInstallProvider verwendet werden.");
  return state;
}

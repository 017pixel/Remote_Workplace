import type { NotificationSettingsResponse } from "@wrapt/contracts";
import { useEffect, useMemo, useState } from "react";
import { WebPushDeviceClient, type WebPushDeviceState } from "./webPushDevice";

const checkingState: WebPushDeviceState = {
  status: "checking",
  permission: "unsupported",
  endpoint: null,
  message: "Der Gerätestatus wird geprüft.",
};

export function useWebPushDevice(settings: NotificationSettingsResponse | undefined) {
  const client = useMemo(() => new WebPushDeviceClient(), []);
  const [device, setDevice] = useState<WebPushDeviceState>(checkingState);
  const [working, setWorking] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    if (!settings) return;
    let current = true;
    setDevice(checkingState);
    void client.inspect(settings)
      .then((next) => { if (current) setDevice(next); })
      .catch(() => {
        if (current) setDevice({ status: "service-worker-error", permission: "unsupported", endpoint: null, message: "Der Gerätestatus konnte nicht gelesen werden. Lade die App neu und versuche es erneut." });
      });
    return () => { current = false; };
  }, [client, settings]);

  const run = async (action: "activate" | "deactivate") => {
    if (!settings) return;
    setWorking(true);
    setActionMessage("");
    try {
      const next = action === "activate" ? await client.activate(settings) : await client.deactivate(settings);
      setDevice(next);
      setActionMessage(next.message);
    } finally {
      setWorking(false);
    }
  };

  const test = async () => {
    if (!device.endpoint) return;
    setWorking(true);
    setActionMessage("");
    try {
      await client.sendTest(device.endpoint);
      setActionMessage("Die Testbenachrichtigung wurde an dieses Gerät gesendet.");
    } catch {
      setActionMessage("Die Testbenachrichtigung konnte nicht gesendet werden. Prüfe Serverlogs, Netzwerk und Push-Berechtigung.");
    } finally {
      setWorking(false);
    }
  };

  return {
    device,
    working,
    actionMessage,
    activate: () => run("activate"),
    deactivate: () => run("deactivate"),
    test,
  };
}

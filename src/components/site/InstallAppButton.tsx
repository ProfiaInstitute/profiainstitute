import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallContextValue {
  install: () => Promise<void>;
  installed: boolean;
}

const InstallContext = createContext<InstallContextValue | null>(null);

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && navigator.standalone === true);
    setInstalled(standalone);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === "accepted") setInstalled(true);
        setInstallPrompt(null);
      } catch (error) {
        console.error("Could not open the Profia app install prompt:", error);
        toast.error("Could not open the install prompt", {
          description: "Use your browser menu to install the app instead.",
        });
      }
      return;
    }

    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    toast.info(
      "Install Profia",
      isIos
        ? { description: "Tap Share in Safari, then choose Add to Home Screen." }
        : { description: "Open your browser menu and choose Install app or Add to Home Screen." },
    );
  }

  return (
    <InstallContext.Provider value={{ install, installed }}>{children}</InstallContext.Provider>
  );
}

export function InstallAppButton() {
  const installContext = useContext(InstallContext);
  if (!installContext) throw new Error("InstallAppButton must be used within PwaInstallProvider.");
  const { install, installed } = installContext;

  if (installed) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant="heroOutline"
      onClick={() => void install()}
      aria-label="Install Profia app"
    >
      <Download />
      <span className="hidden sm:inline">Install app</span>
    </Button>
  );
}

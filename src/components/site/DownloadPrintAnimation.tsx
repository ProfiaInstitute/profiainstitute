import { useEffect, useState } from "react";
import { Printer } from "lucide-react";

type PrintState = { label: string; id: number } | null;
const downloadAction =
  /\b(download|export|save|receipt|answer sheet|admission letter|fee statement)\b/i;
const receiptAction = /\breceipt\b/i;

export function DownloadPrintAnimation() {
  const [printState, setPrintState] = useState<PrintState>(null);

  useEffect(() => {
    let hideTimer: number | undefined;
    let nextId = 0;
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>(
        "button, a[href], [role='button'], [data-document-download]",
      );
      if (!control || control.dataset["documentDownload"] === "false") return;
      if (!event.isTrusted && control instanceof HTMLAnchorElement) return;
      const label =
        control.dataset["documentName"] ||
        control.getAttribute("aria-label") ||
        control.getAttribute("title") ||
        control.textContent?.replace(/\s+/g, " ").trim() ||
        "";
      const hasDownloadAttribute =
        control instanceof HTMLAnchorElement && control.hasAttribute("download");
      if (!hasDownloadAttribute && !downloadAction.test(label)) return;
      if (receiptAction.test(label)) return;
      const normalizedLabel = label
        .replace(/\b(download|export|save)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      const id = ++nextId;
      setPrintState({
        id,
        label: normalizedLabel || "Your document",
      });
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setPrintState(null), 2600);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    };
  }, []);

  if (!printState) return null;
  return (
    <div key={printState.id} className="document-print-toast" role="status" aria-live="polite">
      <div className="document-print-machine">
        <div className="document-print-machine-top">
          <span className="document-print-brand">P</span>
          <Printer aria-hidden="true" className="h-4 w-4 text-white/75" />
        </div>
        <div className="document-print-slot" />
        <div className="document-print-paper">
          <span className="document-print-paper-brand">PROFIA INSTITUTE</span>
          <span className="document-print-paper-title">{printState.label}</span>
          <span className="document-print-paper-lines" />
        </div>
      </div>
      <div className="document-print-copy">
        <span className="document-print-status">Preparing download</span>
        <span className="document-print-name">{printState.label}</span>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;
type ToastKind = "success" | "error" | "info" | "warning";

const toastCharacters: Record<ToastKind, string[]> = {
  success: ["🦊", "🐼", "🦄", "🐸", "🐧", "🐰", "🦋"],
  error: ["🦝", "🐱", "🐢", "🐙", "🦖", "🐨", "🐣"],
  info: ["🦉", "🐬", "🐻", "🐿️", "🐥", "🦭"],
  warning: ["🦔", "🐤", "🦥", "🐵", "🦜", "🦒"],
};

function AnimatedToastCharacter({ kind }: { kind: ToastKind }) {
  const characters = toastCharacters[kind];
  const [index, setIndex] = useState(() => Math.floor(Math.random() * characters.length));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % characters.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [characters.length]);

  return (
    <span className={`toast-mascot toast-mascot-${kind}`} aria-hidden="true">
      <span className="toast-mascot-emoji">
        <span className="toast-mascot-character" key={index}>
          {characters[index]}
        </span>
      </span>
    </span>
  );
}

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      richColors={false}
      closeButton
      visibleToasts={4}
      gap={10}
      offset="24px"
      mobileOffset={{ bottom: "16px" }}
      toastOptions={{
        duration: 4800,
        closeButtonAriaLabel: "Dismiss notification",
        classNames: {
          toast: "group toast toast-card",
          success: "toast-kind-success",
          error: "toast-kind-error",
          info: "toast-kind-info",
          warning: "toast-kind-warning",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      icons={{
        success: <AnimatedToastCharacter kind="success" />,
        error: <AnimatedToastCharacter kind="error" />,
        info: <AnimatedToastCharacter kind="info" />,
        warning: <AnimatedToastCharacter kind="warning" />,
      }}
      {...props}
    />
  );
};

export { Toaster };

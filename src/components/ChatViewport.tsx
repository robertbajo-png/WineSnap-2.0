import { useEffect, useState, type ReactNode } from "react";

export function ChatViewport({ children }: { children: ReactNode }) {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => setHeight(viewport?.height ?? window.innerHeight);
    update();
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div
      className="chat-viewport -mx-5 -mt-6 flex min-h-0 flex-col px-5 pt-3"
      style={{
        height: `calc(${height === null ? "100dvh" : `${height}px`} - var(--bottom-nav-height) - env(safe-area-inset-top, 0px))`,
      }}
    >
      {children}
    </div>
  );
}

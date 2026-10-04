import { useEffect, useState, type ReactNode } from "react";

export function ChatViewport({
  children,
  onKeyboardChange,
}: {
  children: ReactNode;
  onKeyboardChange?: (open: boolean) => void;
}) {
  const [viewportState, setViewportState] = useState<{ height: number | null; keyboard: boolean }>({
    height: null,
    keyboard: false,
  });
  useEffect(() => {
    const viewport = window.visualViewport;
    let width = window.innerWidth;
    let fullHeight = window.innerHeight;
    const update = () => {
      // Android can resize innerHeight too, so retain the unobscured height while an input is focused.
      if (width !== window.innerWidth) {
        width = window.innerWidth;
        fullHeight = window.innerHeight;
      }
      const focused = document.activeElement?.matches("textarea, input") ?? false;
      if (!focused) fullHeight = window.innerHeight;
      const height = viewport?.height ?? window.innerHeight;
      const keyboard = focused && width < 768 && fullHeight - height > 100;
      setViewportState({ height, keyboard });
      onKeyboardChange?.(keyboard);
    };
    update();
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [onKeyboardChange]);
  return (
    <div
      className="chat-viewport -mx-5 -mt-6 flex min-h-0 flex-col px-5 pt-3"
      data-keyboard={viewportState.keyboard}
      style={{
        height: `calc(${viewportState.height === null ? "100dvh" : `${viewportState.height}px`} - ${viewportState.keyboard ? "0px" : "var(--bottom-nav-height)"} - env(safe-area-inset-top, 0px))`,
      }}
    >
      {children}
    </div>
  );
}

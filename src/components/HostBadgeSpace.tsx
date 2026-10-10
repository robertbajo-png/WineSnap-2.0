import { useEffect } from "react";

/** Keep host branding visible without letting it cover mobile app controls. */
export function HostBadgeSpace() {
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    let observed: Element | null = null;
    const measure = () => {
      const badge = document.getElementById("lovable-badge");
      if (badge !== observed) {
        if (observed) resize.unobserve(observed);
        observed = badge;
        if (badge) resize.observe(badge);
      }
      const rect = badge?.getBoundingClientRect();
      const inset =
        query.matches && rect && rect.height > 0 && rect.width > 0
          ? Math.max(0, window.innerHeight - rect.top + 8)
          : 0;
      document.documentElement.style.setProperty("--host-badge-space", `${inset}px`);
    };
    const resize = new ResizeObserver(measure);
    const mutations = new MutationObserver(measure);
    mutations.observe(document.body, { childList: true, subtree: true });
    query.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      resize.disconnect();
      mutations.disconnect();
      query.removeEventListener("change", measure);
      window.removeEventListener("resize", measure);
      document.documentElement.style.removeProperty("--host-badge-space");
    };
  }, []);
  return null;
}

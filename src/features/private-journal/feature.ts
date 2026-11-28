const fixture = import.meta.env.MODE === "private-journal-check";
const pageOrigin = fixture ? "http://127.0.0.1:5291" : "http://127.0.0.1:5212";
export const privateJournalEndpoint = fixture ? "http://127.0.0.1:5292" : "http://127.0.0.1:5218";

export function canOpenPrivateJournal() {
  return (
    import.meta.env.VITE_PRIVATE_JOURNAL_ENABLED === "true" &&
    import.meta.env.VITE_OWNED_BACKEND_ENABLED === "true" &&
    typeof window !== "undefined" &&
    window.location.origin === pageOrigin
  );
}

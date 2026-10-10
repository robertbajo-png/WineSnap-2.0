type RatingNote = { rating: number | null; created_at: string; user_id: string };
export type RatedWine = {
  user_id?: string;
  user_rating?: number | null;
  tasting_notes?: RatingNote[] | null;
};
export function wineRating(wine: RatedWine): number | null {
  const valid = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5;
  const notes = (wine.tasting_notes ?? [])
    .filter((note) => (!wine.user_id || note.user_id === wine.user_id) && valid(note.rating))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return notes[0]?.rating ?? (valid(wine.user_rating) ? wine.user_rating : null);
}
export function bottleCount(wine: { quantity?: number | null; consumed_at?: string | null }) {
  return wine.consumed_at ? 0 : Math.max(0, wine.quantity ?? 1);
}
export function profileStats(
  wines: (RatedWine & {
    user_id?: string;
    quantity?: number | null;
    consumed_at?: string | null;
  })[],
  owner: string,
) {
  const own = wines.filter((wine) => wine.user_id === owner);
  const ratings = own.map(wineRating).filter((rating): rating is number => rating !== null);
  return {
    bottles: own.reduce((sum, wine) => sum + bottleCount(wine), 0),
    tasted: ratings.length,
    average: ratings.length
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : null,
  };
}

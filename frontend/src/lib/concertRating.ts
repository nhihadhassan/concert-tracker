/** Concert ratings are stored on a 10-point scale; the interface uses 100 points. */
export const formatConcertRating100 = (rating: number): string =>
  String(Math.round(rating * 1000) / 100)

export const toStoredConcertRating = (rating: number | null): number | null =>
  rating === null ? null : Math.round((rating / 10) * 100) / 100

// Called by Astro at build time, never by a browser date timer.
export const copyrightYears = (year: number) =>
  year <= 2026 ? '2026' : `2026–${year}`;

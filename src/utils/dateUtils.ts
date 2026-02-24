/**
 * Format a Date as YYYY-MM-DD string for database storage.
 */
export function toDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a Date as the Obsidian daily-note filename: M_D_YY.md
 * Example: February 23 2026 → 2_23_26.md
 */
export function formatObsidianFilename(date: Date = new Date()): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear() % 100;
  return `${month}_${day}_${year}.md`;
}

/**
 * Format a Date for display headers, e.g. "February 23, 2026"
 */
export function formatDisplayDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a Date as short form for the Review screen header: M/D/YY
 */
export function formatShortDate(date: Date = new Date()): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear() % 100;
  return `${month}/${day}/${year.toString().padStart(2, '0')}`;
}

/**
 * Format a Date as the wiki-link date format: M.DD.YY
 */
export function formatWikiDate(date: Date = new Date()): string {
  const month = date.getMonth() + 1;
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear() % 100;
  return `${month}.${day}.${String(year).padStart(2, '0')}`;
}

/**
 * Format a timestamp for chat display: "2:37 PM"
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Parse a "HH:MM" 24-hour time string into hours and minutes.
 */
export function parseTimeString(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(':').map(Number);
  return { hours: h, minutes: m };
}

/**
 * Return a random time (as a Date) between two "HH:MM" strings on the given day.
 */
export function randomTimeBetween(startTime: string, endTime: string, baseDate: Date = new Date()): Date {
  const { hours: sh, minutes: sm } = parseTimeString(startTime);
  const { hours: eh, minutes: em } = parseTimeString(endTime);

  const startMs = (sh * 60 + sm) * 60 * 1000;
  const endMs = (eh * 60 + em) * 60 * 1000;
  const randomMs = startMs + Math.random() * (endMs - startMs);

  const result = new Date(baseDate);
  result.setHours(0, 0, 0, 0);
  result.setTime(result.getTime() + randomMs);
  return result;
}

/**
 * Return true if the given date is "today".
 */
export function isToday(date: Date): boolean {
  return toDateString(date) === toDateString(new Date());
}

/**
 * Calculate date N days ago as a YYYY-MM-DD string.
 */
export function daysAgoString(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateString(d);
}

/**
 * Return a human-readable "time ago" string, e.g. "2 minutes ago".
 */
export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

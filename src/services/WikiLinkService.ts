import type { WikiLink, WikiLinkType } from '../types';
import {
  getAllWikiLinks,
  upsertWikiLink,
  insertWikiLinkAlias,
  findWikiLinkByAlias,
  getWikiLinkCount,
  clearWikiLinks,
} from '../database/queries';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

class WikiLinkService {
  private cache: Map<string, WikiLink> = new Map();
  private cacheExpiry: Date = new Date(0);

  /** Load all wiki-links from the database into the in-memory cache. */
  async loadLinks(): Promise<void> {
    if (this.cache.size > 0 && new Date() < this.cacheExpiry) return;

    const links = await getAllWikiLinks();
    this.cache.clear();

    for (const link of links) {
      this.cache.set(link.text.toLowerCase(), link);
      for (const alias of link.aliases) {
        this.cache.set(alias.toLowerCase(), link);
      }
    }

    this.cacheExpiry = new Date(Date.now() + CACHE_TTL_MS);
  }

  /** Invalidate the in-memory cache so next access re-queries the DB. */
  invalidateCache(): void {
    this.cacheExpiry = new Date(0);
  }

  /**
   * Find the best matching wiki-link for the given text.
   * Priority: exact → alias → partial → case-insensitive partial
   */
  async findMatch(text: string): Promise<WikiLink | null> {
    await this.loadLinks();
    const lower = text.toLowerCase();

    // Exact match
    if (this.cache.has(lower)) return this.cache.get(lower)!;

    // Database alias lookup (covers partial first-name matches)
    const dbMatch = await findWikiLinkByAlias(lower);
    if (dbMatch) return dbMatch;

    // Partial match (text contains one of the known links)
    for (const [key, link] of this.cache.entries()) {
      if (key.includes(lower) || lower.includes(key)) return link;
    }

    return null;
  }

  /**
   * Return up to 5 suggestions for autocomplete based on a partial input.
   */
  async suggestLinks(partial: string): Promise<WikiLink[]> {
    await this.loadLinks();
    const lower = partial.toLowerCase();
    const seen = new Set<string>();
    const results: WikiLink[] = [];

    for (const [key, link] of this.cache.entries()) {
      if (seen.has(link.text)) continue;
      if (key.startsWith(lower) || link.text.toLowerCase().includes(lower)) {
        seen.add(link.text);
        results.push(link);
        if (results.length >= 5) break;
      }
    }

    return results.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Add a new wiki-link (or increment frequency if it exists).
   * Returns the saved WikiLink.
   */
  async addLink(text: string, type?: WikiLinkType): Promise<WikiLink> {
    const linkType = type ?? this.categorizeLink(text);
    const now = new Date();
    const link: WikiLink = {
      text,
      type: linkType,
      frequency: 1,
      aliases: this.generateAliases(text),
      firstSeen: now,
      lastUsed: now,
    };

    const id = await upsertWikiLink(link);
    link.id = id;

    for (const alias of link.aliases) {
      await insertWikiLinkAlias(id, alias);
    }

    this.invalidateCache();
    return link;
  }

  /**
   * Bulk-import wiki-links extracted from vault scanning.
   * Uses upsert logic so re-scanning only increases frequency.
   */
  async bulkAddLinks(links: WikiLink[]): Promise<void> {
    for (const link of links) {
      const id = await upsertWikiLink(link);
      for (const alias of link.aliases) {
        await insertWikiLinkAlias(id, alias);
      }
    }
    this.invalidateCache();
  }

  /**
   * Extract potential wiki-link candidates from a message string.
   * Looks for capitalized words/phrases that could be names or topics.
   */
  extractPotentialLinks(message: string): string[] {
    const patterns = [
      // Full-name pattern: "John Smith"
      /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g,
      // Single capitalized word (not sentence start)
      /(?<=[.!?]\s|^)(?:[A-Z][a-z]{2,})\b/gm,
    ];

    const found = new Set<string>();
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      const re = new RegExp(pattern.source, pattern.flags);
      while ((match = re.exec(message)) !== null) {
        found.add(match[1] ?? match[0]);
      }
    }

    return [...found];
  }

  /**
   * Auto-link text by replacing recognized names/topics with [[links]].
   */
  async autoLinkText(text: string): Promise<string> {
    await this.loadLinks();
    let result = text;

    // Collect unique links sorted by text length (longest first for greedy match)
    const allLinks: WikiLink[] = [];
    const seen = new Set<string>();
    for (const link of this.cache.values()) {
      if (!seen.has(link.text)) {
        seen.add(link.text);
        allLinks.push(link);
      }
    }
    allLinks.sort((a, b) => b.text.length - a.text.length);

    for (const link of allLinks) {
      const escaped = link.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Don't re-link already linked text
      const re = new RegExp(`(?<!\\[\\[)\\b${escaped}\\b(?!\\]\\])`, 'gi');
      result = result.replace(re, `[[${link.text}]]`);
    }

    return result;
  }

  /**
   * Categorize a link text heuristically.
   */
  categorizeLink(text: string): WikiLinkType {
    // Date pattern: 9.14.25 or 2.23.26
    if (/^\d{1,2}\.\d{2}\.\d{2}$/.test(text)) return 'date';
    // Two-word capitalized name → person
    if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(text)) return 'person';
    // Place patterns
    if (/National Park|2025|2026|Park$|Japan|Mt\.|Lake |River /i.test(text)) return 'place';
    // Religious / concept terms
    if (/^(Lord|Christ|God|Heavenly Father|Holy Ghost|Faith|Gospel)$/i.test(text)) return 'concept';
    return 'unknown';
  }

  /**
   * Generate alias variations for a wiki-link text.
   * e.g. "Nate Stapleton" → ["nate", "stapleton", "nate stapleton"]
   */
  generateAliases(text: string): string[] {
    const aliases: string[] = [text.toLowerCase()];

    if (text.includes(' ')) {
      const parts = text.split(' ');
      aliases.push(parts[0].toLowerCase());
      if (parts.length === 2) aliases.push(parts[1].toLowerCase());
    }

    return [...new Set(aliases)];
  }

  /** Return the total count of stored wiki-links. */
  async getLinkCount(): Promise<number> {
    return getWikiLinkCount();
  }

  /** Clear all stored wiki-links (for re-scanning). */
  async clearAllLinks(): Promise<void> {
    await clearWikiLinks();
    this.invalidateCache();
  }

  /** Get all links (for passing to Gemini prompt). */
  async getAllLinks(): Promise<WikiLink[]> {
    return getAllWikiLinks();
  }
}

export const wikiLinkService = new WikiLinkService();
export default wikiLinkService;

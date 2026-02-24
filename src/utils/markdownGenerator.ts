import type { Message, WikiLink } from '../types';
import { formatWikiDate } from './dateUtils';

/**
 * Build the prompt sent to Gemini for generating a journal entry.
 */
export function buildEntryGenerationPrompt(
  messages: Message[],
  wikiLinks: WikiLink[],
  date: Date = new Date()
): string {
  const dateStr = formatWikiDate(date);

  const conversation = messages
    .map(m => `${m.role === 'user' ? 'Me' : 'AI'}: ${m.content}`)
    .join('\n');

  const topLinks = wikiLinks
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 100)
    .map(l => l.text)
    .join(', ');

  return `Generate a journal entry based ONLY on this conversation from ${dateStr}.

Conversation:
${conversation}

Writing style: Natural, conversational, stream-of-consciousness prose.
Format: Free-form paragraphs (no bullet points, no numbered lists).

Formatting rules:
- Use [[Name]] for people (full names like [[Nate Stapleton]])
- Use [[Topic]] for topics, places, concepts
- Reference dates as [[${dateStr}]] format
- If gratitude was expressed, add a "### [[Gratitude]] Corner" section at the end
- Do NOT include content from previous days
- Do NOT include formal headers (except Gratitude)
- Do NOT include your own commentary or meta-discussion
- Match a conversational, personal journaling tone

Known wiki-links to use when applicable: ${topLinks || 'none yet'}

Generate the journal entry:`;
}

/**
 * Build the system prompt for conversational sessions.
 */
export function buildSessionSystemPrompt(sessionType: 'midday' | 'evening'): string {
  if (sessionType === 'midday') {
    return `You are a friendly journaling companion helping someone reflect on their day so far.
Ask natural, open-ended follow-up questions based on what they share.
Keep questions concise and conversational — like texting a close friend.
Focus on one topic at a time. If they mention something interesting, dig deeper.
After 3-4 exchanges, or if they seem done, ask "Anything else on your mind?"
Keep your responses short — 1-2 sentences at most.`;
  }

  return `You are a friendly journaling companion helping someone wrap up their day.
Ask thoughtful questions to help them reflect on the full day — what happened,
how they felt, what they're grateful for.
Keep questions concise and conversational — like texting a close friend.
Focus on one topic at a time. After 3-4 exchanges ask "Anything else before we wrap up?"
Keep your responses short — 1-2 sentences at most.`;
}

/**
 * Auto-link detected names/topics in plain text using the wiki-link database.
 * Returns the text with [[links]] inserted.
 */
export function autoLinkText(text: string, wikiLinks: WikiLink[]): string {
  let result = text;

  // Sort by text length descending so longer matches take priority
  const sortedLinks = [...wikiLinks].sort((a, b) => b.text.length - a.text.length);

  for (const link of sortedLinks) {
    // Skip if already wrapped in [[]]
    const escaped = escapeRegex(link.text);
    const pattern = new RegExp(`(?<!\\[\\[)\\b${escaped}\\b(?!\\]\\])`, 'g');
    result = result.replace(pattern, `[[${link.text}]]`);
  }

  return result;
}

/**
 * Extract all [[wiki-link]] texts from a markdown string.
 */
export function extractWikiLinks(markdown: string): string[] {
  const pattern = /\[\[([^\]]+)\]\]/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    found.push(match[1]);
  }

  return [...new Set(found)];
}

/**
 * Check if the text expresses gratitude and a Gratitude Corner should be added.
 */
export function hasGratitudeExpression(messages: Message[]): boolean {
  const gratitudeKeywords = [
    'grateful', 'thankful', 'thank', 'blessed', 'appreciate',
    'appreciate', 'gratitude', 'fortunate', 'lucky',
  ];
  const combined = messages.map(m => m.content.toLowerCase()).join(' ');
  return gratitudeKeywords.some(kw => combined.includes(kw));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

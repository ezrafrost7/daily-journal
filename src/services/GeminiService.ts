import { GoogleGenerativeAI, GenerativeModel, ChatSession } from '@google/generative-ai';
import type { Message, WikiLink, ConversationContext } from '../types';
import { buildEntryGenerationPrompt, buildSessionSystemPrompt } from '../utils/markdownGenerator';

const DEFAULT_CONVERSATION_TEMPERATURE = 0.7;
const DEFAULT_ENTRY_TEMPERATURE = 0.3;
const MAX_CONVERSATION_TOKENS = 500;
const MAX_ENTRY_TOKENS = 2000;
const MAX_RETRIES = 3;

class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private apiKey: string = '';

  /** Initialize or reinitialize with a new API key. */
  initialize(apiKey: string): void {
    this.apiKey = apiKey;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  /** Returns true if the service has been initialized. */
  get isInitialized(): boolean {
    return this.model !== null && this.apiKey !== '';
  }

  /**
   * Test the connection with a simple ping message.
   * Returns true if the API responds successfully.
   */
  async testConnection(): Promise<boolean> {
    if (!this.model) return false;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Say "connected" in one word.' }] }],
        generationConfig: { maxOutputTokens: 10 },
      });
      const text = result.response.text();
      return text.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Send a user message within a journaling session and get a follow-up question.
   */
  async sendMessage(
    userMessage: string,
    context: ConversationContext,
    sessionType: 'midday' | 'evening'
  ): Promise<string> {
    return this.withRetry(async () => {
      if (!this.model) throw new Error('GeminiService not initialized');

      const systemPrompt = buildSessionSystemPrompt(sessionType);

      const history = context.messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      }));

      const chat: ChatSession = this.model.startChat({
        history: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Got it! I\'m here to help you journal.' }] },
          ...history,
        ],
        generationConfig: {
          temperature: DEFAULT_CONVERSATION_TEMPERATURE,
          maxOutputTokens: MAX_CONVERSATION_TOKENS,
        },
      });

      const result = await chat.sendMessage(userMessage);
      return result.response.text();
    });
  }

  /**
   * Generate a full journal entry from today's messages and existing wiki-links.
   */
  async generateEntry(
    messages: Message[],
    wikiLinks: WikiLink[],
    date: Date = new Date()
  ): Promise<string> {
    return this.withRetry(async () => {
      if (!this.model) throw new Error('GeminiService not initialized');

      const prompt = buildEntryGenerationPrompt(messages, wikiLinks, date);

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: DEFAULT_ENTRY_TEMPERATURE,
          maxOutputTokens: MAX_ENTRY_TOKENS,
        },
      });

      return result.response.text();
    });
  }

  /**
   * Regenerate an entry with a request for a different variation.
   */
  async regenerateEntry(
    messages: Message[],
    wikiLinks: WikiLink[],
    previousEntry: string,
    date: Date = new Date()
  ): Promise<string> {
    return this.withRetry(async () => {
      if (!this.model) throw new Error('GeminiService not initialized');

      const basePrompt = buildEntryGenerationPrompt(messages, wikiLinks, date);
      const prompt = `${basePrompt}

Note: A previous version was generated but the user wants a different take. Here was the previous version for reference (do NOT copy it, write something fresh):
---
${previousEntry}
---

Generate a fresh variation:`;

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8, // Higher temp for more variation
          maxOutputTokens: MAX_ENTRY_TOKENS,
        },
      });

      return result.response.text();
    });
  }

  /** Retry logic with exponential backoff. */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < MAX_RETRIES - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Graceful fallback response for when the API is unavailable.
   */
  getFallbackResponse(): string {
    return "I'm having trouble connecting right now. Your message has been saved and I'll respond when I reconnect.";
  }
}

// Singleton instance
export const geminiService = new GeminiService();
export default geminiService;

import { v4 as uuidv4 } from 'uuid';
import type { Message, Session, ConversationContext, SessionType } from '../types';
import {
  insertMessage,
  insertSession,
  updateSessionActive,
  getMessagesForDate,
  getMessagesForSession,
  getActiveSession,
  getSessionById,
  getSessionsForDate,
  deleteOldMessages,
  getMessageStats,
} from '../database/queries';
import { toDateString, daysAgoString } from '../utils/dateUtils';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MESSAGE_RETENTION_DAYS = 30;

class ConversationService {
  /** Create a new journaling session. */
  async createSession(sessionType: SessionType): Promise<Session> {
    const now = new Date();
    const session: Session = {
      id: uuidv4(),
      sessionType,
      date: toDateString(now),
      startTime: now,
      lastInteraction: now,
      messages: [],
      isActive: true,
      entryGenerated: false,
    };

    await insertSession(session);
    return session;
  }

  /** Add a message to a session and persist it. */
  async addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<Message> {
    const now = new Date();
    const message: Message = {
      id: uuidv4(),
      sessionId,
      role,
      content,
      timestamp: now,
      date: toDateString(now),
    };

    await insertMessage(message);
    return message;
  }

  /** Get all messages for today across all sessions. */
  async getTodaysMessages(): Promise<Message[]> {
    return getMessagesForDate(toDateString(new Date()));
  }

  /** Get messages for a specific session. */
  async getSessionMessages(sessionId: string): Promise<Message[]> {
    return getMessagesForSession(sessionId);
  }

  /** Get or create the active session for today. */
  async getOrCreateSession(sessionType: SessionType): Promise<Session> {
    const today = toDateString(new Date());
    const existing = await getActiveSession(today);

    if (existing && !this.isSessionTimedOut(existing)) {
      return existing;
    }

    if (existing) {
      await this.endSession(existing.id);
    }

    return this.createSession(sessionType);
  }

  /** End a session by marking it inactive. */
  async endSession(sessionId: string): Promise<void> {
    await updateSessionActive(sessionId, false, new Date());
  }

  /** Check if a session has timed out (30 minutes of inactivity). */
  isSessionTimedOut(session: Session): boolean {
    const elapsed = Date.now() - session.lastInteraction.getTime();
    return elapsed > SESSION_TIMEOUT_MS;
  }

  /** Get today's sessions with message counts. */
  async getTodaysSessions(): Promise<Session[]> {
    return getSessionsForDate(toDateString(new Date()));
  }

  /** Check if there was an active session today for the given type. */
  async hasSessionToday(sessionType: SessionType): Promise<boolean> {
    const sessions = await getSessionsForDate(toDateString(new Date()));
    return sessions.some(s => s.sessionType === sessionType);
  }

  /**
   * Build the conversation context for the Gemini API.
   * Limits history to the last `limit` message pairs.
   */
  async getConversationContext(
    sessionId: string,
    limit: number = 10
  ): Promise<ConversationContext> {
    const messages = await getMessagesForSession(sessionId);
    const limited = messages.slice(-limit * 2); // Each exchange = 2 messages

    return {
      messages: limited.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        content: m.content,
        timestamp: m.timestamp,
      })),
      userProfile: {
        writingStyle: 'Natural, conversational, stream-of-consciousness',
        commonTopics: [],
        commonPeople: [],
      },
    };
  }

  /** Remove messages older than MESSAGE_RETENTION_DAYS days. */
  async pruneOldMessages(): Promise<void> {
    const cutoff = daysAgoString(MESSAGE_RETENTION_DAYS);
    await deleteOldMessages(cutoff);
  }

  /** Get statistics about conversations. */
  async getStats() {
    return getMessageStats();
  }

  /** Get full session object by ID. */
  async getSession(sessionId: string): Promise<Session | null> {
    return getSessionById(sessionId);
  }
}

export const conversationService = new ConversationService();
export default conversationService;

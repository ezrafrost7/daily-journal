import { getDatabase } from './schema';
import type {
  Message,
  Session,
  WikiLink,
  MessageRow,
  SessionRow,
  WikiLinkRow,
  WikiLinkAliasRow,
} from '../types';

// ─── Session Queries ───────────────────────────────────────────────────────────

export async function insertSession(session: Omit<Session, 'messages'>): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO sessions
      (id, session_type, date, start_time, end_time, is_active, entry_generated)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.sessionType,
      session.date,
      session.startTime.toISOString(),
      null,
      session.isActive ? 1 : 0,
      session.entryGenerated ? 1 : 0,
    ]
  );
}

export async function updateSessionActive(
  sessionId: string,
  isActive: boolean,
  endTime?: Date
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET is_active = ?, end_time = ? WHERE id = ?`,
    [isActive ? 1 : 0, endTime ? endTime.toISOString() : null, sessionId]
  );
}

export async function updateSessionEntryGenerated(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE sessions SET entry_generated = 1 WHERE id = ?`, [sessionId]);
}

export async function getSessionById(sessionId: string): Promise<Session | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT * FROM sessions WHERE id = ?`,
    [sessionId]
  );
  if (!row) return null;
  return rowToSession(row);
}

export async function getActiveSession(date: string): Promise<Session | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT * FROM sessions WHERE date = ? AND is_active = 1 ORDER BY start_time DESC LIMIT 1`,
    [date]
  );
  if (!row) return null;
  return rowToSession(row);
}

export async function getSessionsForDate(date: string): Promise<Session[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT * FROM sessions WHERE date = ? ORDER BY start_time ASC`,
    [date]
  );
  return rows.map(rowToSession);
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    sessionType: row.session_type as 'midday' | 'evening',
    date: row.date,
    startTime: new Date(row.start_time),
    lastInteraction: new Date(row.start_time),
    messages: [],
    isActive: row.is_active === 1,
    entryGenerated: row.entry_generated === 1,
  };
}

// ─── Message Queries ───────────────────────────────────────────────────────────

export async function insertMessage(message: Message): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO messages (id, session_id, role, content, timestamp, date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      message.sessionId,
      message.role,
      message.content,
      message.timestamp.toISOString(),
      message.date,
    ]
  );
}

export async function getMessagesForDate(date: string): Promise<Message[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT * FROM messages WHERE date = ? ORDER BY timestamp ASC`,
    [date]
  );
  return rows.map(rowToMessage);
}

export async function getMessagesForSession(sessionId: string): Promise<Message[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC`,
    [sessionId]
  );
  return rows.map(rowToMessage);
}

export async function getRecentMessages(limit: number = 20): Promise<Message[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?`,
    [limit]
  );
  return rows.map(rowToMessage).reverse();
}

export async function deleteOldMessages(cutoffDate: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM messages WHERE date < ?`, [cutoffDate]);
}

export async function getMessageStats(): Promise<{
  totalMessages: number;
  sessionsToday: number;
  lastMessage: Date | null;
}> {
  const db = await getDatabase();
  const today = new Date().toISOString().split('T')[0];

  const totalRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM messages`
  );
  const sessionRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sessions WHERE date = ?`,
    [today]
  );
  const lastRow = await db.getFirstAsync<{ timestamp: string }>(
    `SELECT timestamp FROM messages ORDER BY timestamp DESC LIMIT 1`
  );

  return {
    totalMessages: totalRow?.count ?? 0,
    sessionsToday: sessionRow?.count ?? 0,
    lastMessage: lastRow ? new Date(lastRow.timestamp) : null,
  };
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    timestamp: new Date(row.timestamp),
    date: row.date,
  };
}

// ─── Wiki Link Queries ────────────────────────────────────────────────────────

export async function upsertWikiLink(link: WikiLink): Promise<number> {
  const db = await getDatabase();

  const existing = await db.getFirstAsync<{ id: number; frequency: number }>(
    `SELECT id, frequency FROM wiki_links WHERE text = ?`,
    [link.text]
  );

  if (existing) {
    await db.runAsync(
      `UPDATE wiki_links SET frequency = ?, last_used = ?, type = ? WHERE id = ?`,
      [existing.frequency + 1, new Date().toISOString(), link.type, existing.id]
    );
    return existing.id;
  }

  const result = await db.runAsync(
    `INSERT INTO wiki_links (text, type, frequency, first_seen, last_used) VALUES (?, ?, ?, ?, ?)`,
    [link.text, link.type, link.frequency, link.firstSeen.toISOString(), link.lastUsed.toISOString()]
  );
  return result.lastInsertRowId;
}

export async function insertWikiLinkAlias(linkId: number, alias: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR IGNORE INTO wiki_link_aliases (link_id, alias) VALUES (?, ?)`,
    [linkId, alias.toLowerCase()]
  );
}

export async function getAllWikiLinks(): Promise<WikiLink[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WikiLinkRow>(
    `SELECT * FROM wiki_links ORDER BY frequency DESC`
  );

  const links: WikiLink[] = [];
  for (const row of rows) {
    const aliasRows = await db.getAllAsync<WikiLinkAliasRow>(
      `SELECT * FROM wiki_link_aliases WHERE link_id = ?`,
      [row.id]
    );
    links.push({
      id: row.id,
      text: row.text,
      type: row.type as WikiLink['type'],
      frequency: row.frequency,
      aliases: aliasRows.map(a => a.alias),
      firstSeen: new Date(row.first_seen),
      lastUsed: new Date(row.last_used),
    });
  }

  return links;
}

export async function findWikiLinkByAlias(alias: string): Promise<WikiLink | null> {
  const db = await getDatabase();
  const aliasRow = await db.getFirstAsync<WikiLinkAliasRow>(
    `SELECT * FROM wiki_link_aliases WHERE alias = ? LIMIT 1`,
    [alias.toLowerCase()]
  );

  if (!aliasRow) {
    // Try exact text match
    const linkRow = await db.getFirstAsync<WikiLinkRow>(
      `SELECT * FROM wiki_links WHERE LOWER(text) = ? LIMIT 1`,
      [alias.toLowerCase()]
    );
    if (!linkRow) return null;
    return {
      id: linkRow.id,
      text: linkRow.text,
      type: linkRow.type as WikiLink['type'],
      frequency: linkRow.frequency,
      aliases: [],
      firstSeen: new Date(linkRow.first_seen),
      lastUsed: new Date(linkRow.last_used),
    };
  }

  const linkRow = await db.getFirstAsync<WikiLinkRow>(
    `SELECT * FROM wiki_links WHERE id = ?`,
    [aliasRow.link_id]
  );

  if (!linkRow) return null;
  return {
    id: linkRow.id,
    text: linkRow.text,
    type: linkRow.type as WikiLink['type'],
    frequency: linkRow.frequency,
    aliases: [],
    firstSeen: new Date(linkRow.first_seen),
    lastUsed: new Date(linkRow.last_used),
  };
}

export async function getWikiLinkCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM wiki_links`
  );
  return row?.count ?? 0;
}

export async function clearWikiLinks(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`DELETE FROM wiki_link_aliases; DELETE FROM wiki_links;`);
}

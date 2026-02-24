import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('smart_journal.db');
  await initializeSchema(db);
  return db;
}

async function initializeSchema(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      session_type TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      is_active INTEGER DEFAULT 1,
      entry_generated INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME NOT NULL,
      date TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS wiki_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT UNIQUE NOT NULL,
      type TEXT,
      frequency INTEGER DEFAULT 1,
      first_seen DATETIME,
      last_used DATETIME
    );

    CREATE TABLE IF NOT EXISTS wiki_link_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL,
      alias TEXT NOT NULL,
      FOREIGN KEY (link_id) REFERENCES wiki_links(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
    CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);
    CREATE INDEX IF NOT EXISTS idx_wikilinks_text ON wiki_links(text);
    CREATE INDEX IF NOT EXISTS idx_aliases_link ON wiki_link_aliases(link_id);
    CREATE INDEX IF NOT EXISTS idx_aliases_alias ON wiki_link_aliases(alias);
  `);
}

export async function resetDatabase(): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(`
    DROP TABLE IF EXISTS wiki_link_aliases;
    DROP TABLE IF EXISTS wiki_links;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS sessions;
  `);
  await initializeSchema(database);
}

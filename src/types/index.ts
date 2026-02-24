// ─── Core Domain Types ────────────────────────────────────────────────────────

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  date: string; // YYYY-MM-DD
}

export type SessionType = 'midday' | 'evening';

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD
  sessionType: SessionType;
  startTime: Date;
  lastInteraction: Date;
  messages: Message[];
  isActive: boolean;
  entryGenerated: boolean;
}

// ─── Wiki Link Types ──────────────────────────────────────────────────────────

export type WikiLinkType = 'person' | 'topic' | 'place' | 'concept' | 'date' | 'unknown';

export interface WikiLink {
  id?: number;
  text: string;
  type: WikiLinkType;
  frequency: number;
  aliases: string[];
  firstSeen: Date;
  lastUsed: Date;
}

// ─── Configuration Types ──────────────────────────────────────────────────────

export interface NotificationConfig {
  middayStart: string; // "12:00"
  middayEnd: string;   // "15:00"
  eveningTime: string; // "21:00"
  enabled: boolean;
}

export interface VaultConfig {
  vaultPath: string;
  dailyNotesPath: string;
}

export interface AppSettings {
  geminiApiKey: string;
  vault: VaultConfig;
  notifications: NotificationConfig;
  isFirstLaunch: boolean;
  setupComplete: boolean;
}

// ─── Gemini / AI Types ────────────────────────────────────────────────────────

export interface ConversationContextMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export interface UserProfile {
  writingStyle: string;
  commonTopics: string[];
  commonPeople: string[];
}

export interface ConversationContext {
  messages: ConversationContextMessage[];
  userProfile: UserProfile;
}

// ─── Navigation Types ─────────────────────────────────────────────────────────

export type RootStackParamList = {
  Welcome: undefined;
  Permissions: undefined;
  ApiKeySetup: undefined;
  VaultSetup: undefined;
  VaultScanning: undefined;
  NotificationSetup: undefined;
  Tutorial: undefined;
  Home: undefined;
  Chat: { sessionId?: string };
  Review: { date?: string };
  Settings: undefined;
};

// ─── UI State Types ───────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isTyping?: boolean;
}

export interface HomeStatus {
  sessionsToday: number;
  lastMessage: Date | null;
  hasEntryForToday: boolean;
  isGenerating: boolean;
}

// ─── Database Row Types (raw SQLite rows) ─────────────────────────────────────

export interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
  date: string;
}

export interface SessionRow {
  id: string;
  session_type: string;
  date: string;
  start_time: string;
  end_time: string | null;
  is_active: number; // SQLite boolean as int
  entry_generated: number;
}

export interface WikiLinkRow {
  id: number;
  text: string;
  type: string;
  frequency: number;
  first_seen: string;
  last_used: string;
}

export interface WikiLinkAliasRow {
  id: number;
  link_id: number;
  alias: string;
}

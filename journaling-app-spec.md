# Smart Journal App - Technical Specification

## Project Overview

Build an Android journaling app that uses conversational AI (Google Gemini) to create daily journal entries through natural, text-message-style interactions. The app sends smart notifications throughout the day, compiles conversations into formatted Markdown entries, and saves them directly to the user's Obsidian vault.

## Core Requirements

### Platform
- **Target:** Android (React Native)
- **Primary Device:** Google Pixel
- **Minimum Android Version:** 10 (API level 29)
- **Development Environment:** React Native with Expo or bare React Native

### Key Features
1. Conversational journaling via notifications with inline replies
2. Integration with Google Gemini API (free tier)
3. Voice input support
4. Smart wiki-link detection and learning
5. Markdown entry generation matching user's existing format
6. Direct file writing to Obsidian vault on device storage
7. Entry review and editing before saving

---

## Technical Architecture

### Tech Stack

**Framework:**
- React Native (latest stable version)
- TypeScript for type safety

**Key Dependencies:**
```json
{
  "@react-native-async-storage/async-storage": "^1.x",
  "@react-native-voice/voice": "^3.x",
  "react-native-fs": "^2.x",
  "react-native-push-notification": "^8.x",
  "@google/generative-ai": "^0.x",
  "react-native-markdown-display": "^7.x",
  "expo-sqlite": "~13.x"
}
```

### Project Structure
```
journaling-app/
├── src/
│   ├── components/
│   │   ├── ChatInterface.tsx
│   │   ├── ReviewScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   └── NotificationHandler.tsx
│   ├── services/
│   │   ├── GeminiService.ts
│   │   ├── NotificationService.ts
│   │   ├── VaultService.ts
│   │   ├── WikiLinkService.ts
│   │   └── ConversationService.ts
│   ├── utils/
│   │   ├── dateUtils.ts
│   │   ├── markdownGenerator.ts
│   │   └── fileSystem.ts
│   ├── database/
│   │   ├── schema.ts
│   │   └── queries.ts
│   ├── types/
│   │   └── index.ts
│   └── App.tsx
├── android/
└── package.json
```

---

## Detailed Component Specifications

### 1. Notification Service (`NotificationService.ts`)

**Purpose:** Handle scheduled notifications and inline replies

**Key Responsibilities:**
- Schedule two daily notification windows:
  - Midday session: Random time between 12:00 PM - 3:00 PM
  - Evening session: After 9:00 PM (user can customize exact time)
- Handle inline reply actions (Android Direct Reply)
- Manage session state and timeouts
- Track whether user has responded to avoid spam

**Implementation Details:**

```typescript
interface NotificationConfig {
  middayStart: string; // "12:00"
  middayEnd: string;   // "15:00"
  eveningTime: string; // "21:00"
}

interface Session {
  id: string;
  date: string; // YYYY-MM-DD
  sessionType: 'midday' | 'evening';
  startTime: Date;
  lastInteraction: Date;
  messages: Message[];
  isActive: boolean;
}

class NotificationService {
  // Schedule daily notifications
  scheduleDailyNotifications(config: NotificationConfig): void;
  
  // Send initial session notification
  sendSessionStart(sessionType: 'midday' | 'evening'): void;
  
  // Handle inline reply from notification
  handleInlineReply(reply: string, sessionId: string): Promise<void>;
  
  // Send follow-up question as notification
  sendFollowUpNotification(message: string, sessionId: string): void;
  
  // Check for 30-minute timeout
  checkSessionTimeout(sessionId: string): boolean;
  
  // End session and trigger compilation if evening
  endSession(sessionId: string): Promise<void>;
}
```

**Android-Specific Requirements:**
- Use `react-native-push-notification` for local notifications
- Implement Direct Reply action for inline responses
- Request notification permissions on app first launch
- Handle notification clicks to open app

**Notification Text Examples:**
- First midday: "How's your day going?"
- Follow-ups: Contextual based on Gemini's response
- Evening: "Ready to wrap up your day?"
- Review ready: "Your entry is ready to review"

---

### 2. Gemini Service (`GeminiService.ts`)

**Purpose:** Manage all interactions with Google Gemini API

**Key Responsibilities:**
- Maintain conversation context across sessions
- Send messages with appropriate context
- Generate journal entries from conversation
- Handle API errors gracefully

**Implementation Details:**

```typescript
interface ConversationContext {
  messages: Array<{
    role: 'user' | 'model';
    content: string;
    timestamp: Date;
  }>;
  userProfile: {
    writingStyle: string; // Learned from existing entries
    commonTopics: string[];
    commonPeople: string[];
  };
}

class GeminiService {
  private apiKey: string;
  private conversationHistory: ConversationContext;
  
  // Initialize with API key
  constructor(apiKey: string);
  
  // Send user message and get response
  async sendMessage(
    userMessage: string, 
    sessionContext: Session
  ): Promise<string>;
  
  // Generate journal entry from today's conversations
  async generateEntry(
    todaysMessages: Message[],
    existingWikiLinks: WikiLink[]
  ): Promise<string>;
  
  // System prompts for different contexts
  private getSessionPrompt(sessionType: 'midday' | 'evening'): string;
  private getEntryGenerationPrompt(): string;
}
```

**Gemini API Configuration:**
- Model: `gemini-pro` (free tier)
- Temperature: 0.7 for conversational responses
- Temperature: 0.3 for entry generation (more consistent)
- Max output tokens: 500 for questions, 2000 for entries

**System Prompt for Sessions:**
```
You are a friendly journaling companion helping someone reflect on their day. 
Ask natural, open-ended follow-up questions based on what they share. 
Keep questions concise and conversational - like texting a friend.
Focus on one topic at a time. If they mention something interesting, dig deeper.
After 3-4 exchanges or if they seem done, ask "Anything else on your mind?"
```

**System Prompt for Entry Generation:**
```
Generate a journal entry based ONLY on conversations from {DATE}.
Writing style: Natural, conversational, stream-of-consciousness
Format requirements:
- Free-form prose paragraphs
- Use [[Name]] format for people (full names like [[Nate Stapleton]])
- Use [[Topic]] format for topics, places, concepts
- Reference other dates as [[M.DD.YY]] when mentioned
- Add "### [[Gratitude]] Corner" section if gratitude was expressed
- Match the user's existing tone and style

Do not include:
- Any content from previous days
- Formal structure or headers (except Gratitude)
- Your own commentary or meta-discussion

Wiki-links to consider: {EXISTING_LINKS}
```

**Error Handling:**
- Retry failed API calls up to 3 times
- Fall back to local mode if API unavailable
- Cache last response to avoid repeated calls
- Show user-friendly error messages

---

### 3. Vault Service (`VaultService.ts`)

**Purpose:** Manage file operations with Obsidian vault

**Key Responsibilities:**
- Scan existing vault for wiki-links
- Read existing journal entries
- Write new journal entries
- Validate file paths and permissions

**Implementation Details:**

```typescript
interface VaultConfig {
  vaultPath: string; // e.g., /storage/emulated/0/Documents/Obsidian/
  dailyNotesPath: string; // relative path within vault
}

class VaultService {
  private config: VaultConfig;
  
  // Set vault path (user configures in settings)
  setVaultPath(path: string): Promise<boolean>;
  
  // Scan vault for existing wiki-links
  async scanVaultForLinks(): Promise<WikiLink[]>;
  
  // Read existing journal entries (for learning style)
  async readRecentEntries(count: number): Promise<string[]>;
  
  // Write new journal entry
  async writeEntry(date: Date, content: string): Promise<boolean>;
  
  // Check if entry already exists for date
  async entryExists(date: Date): Promise<boolean>;
  
  // Generate filename in M_D_YY.md format
  private formatFilename(date: Date): string;
  
  // Validate vault path has proper permissions
  async validateVaultPath(path: string): Promise<boolean>;
}
```

**File Operations:**
- Use `react-native-fs` for file system access
- Request storage permissions on Android
- Handle permission denials gracefully
- Support both internal storage and SD card paths

**Filename Format:**
```typescript
// Example: February 23, 2026 → 2_23_26.md
function formatFilename(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear() % 100;
  return `${month}_${day}_${year}.md`;
}
```

**Scanning Logic:**
- Recursively scan vault directory
- Extract all `[[...]]` patterns from .md files
- Build database of unique wiki-links
- Categorize by type (person, topic, place) if possible
- Update database periodically

---

### 4. Wiki Link Service (`WikiLinkService.ts`)

**Purpose:** Intelligent wiki-link detection and suggestion

**Key Responsibilities:**
- Store known wiki-links from vault scan
- Suggest links during conversation
- Create new links for new mentions
- Learn patterns (e.g., "Nate" → "[[Nate Stapleton]]")

**Implementation Details:**

```typescript
interface WikiLink {
  text: string;        // "Nate Stapleton"
  type: 'person' | 'topic' | 'place' | 'concept' | 'date' | 'unknown';
  frequency: number;   // How often it appears
  aliases: string[];   // ["Nate", "Stapleton"]
  firstSeen: Date;
  lastUsed: Date;
}

class WikiLinkService {
  private links: Map<string, WikiLink>;
  
  // Load links from database
  async loadLinks(): Promise<void>;
  
  // Find matching wiki-link for text
  findMatch(text: string): WikiLink | null;
  
  // Suggest wiki-link for user input
  suggestLink(text: string): WikiLink[];
  
  // Add new wiki-link
  addLink(text: string, type?: string): WikiLink;
  
  // Extract potential links from message
  extractPotentialLinks(message: string): string[];
  
  // Auto-link text (used in entry generation)
  autoLinkText(text: string): string;
  
  // Update link usage statistics
  updateLinkUsage(link: WikiLink): void;
}
```

**Matching Logic:**
```typescript
// Priority order for matching:
1. Exact match: "Nate Stapleton" → [[Nate Stapleton]]
2. Alias match: "Nate" → [[Nate Stapleton]] (if only one Nate exists)
3. Partial match: "climbing" → [[Climbing]]
4. Case-insensitive: "faith" → [[Faith]]
5. No match: Create new link
```

**Pattern Recognition:**
- People: Detect capitalized names (John, Sarah, Nate Stapleton)
- Topics: Common nouns appearing frequently (climbing, faith, pilot)
- Places: Location names, landmarks (Zion National Park, Japan 2025)
- Dates: M.DD.YY pattern
- Religious terms: Lord, Christ, Heavenly Father, etc.

**Database Schema (SQLite):**
```sql
CREATE TABLE wiki_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT UNIQUE NOT NULL,
  type TEXT,
  frequency INTEGER DEFAULT 1,
  first_seen DATETIME,
  last_used DATETIME
);

CREATE TABLE wiki_link_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER,
  alias TEXT,
  FOREIGN KEY (link_id) REFERENCES wiki_links(id)
);
```

---

### 5. Conversation Service (`ConversationService.ts`)

**Purpose:** Manage conversation state and message history

**Key Responsibilities:**
- Store messages with timestamps
- Track active sessions
- Filter messages by date for entry generation
- Manage conversation persistence

**Implementation Details:**

```typescript
interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  date: string; // YYYY-MM-DD for filtering
}

class ConversationService {
  // Add message to conversation
  async addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<Message>;
  
  // Get all messages for today
  async getTodaysMessages(): Promise<Message[]>;
  
  // Get messages for specific session
  async getSessionMessages(sessionId: string): Promise<Message[]>;
  
  // Get conversation context for API
  async getConversationContext(
    limit?: number
  ): Promise<ConversationContext>;
  
  // Clear old messages (keep last 30 days)
  async pruneOldMessages(): Promise<void>;
  
  // Get statistics (for debugging)
  async getStats(): Promise<{
    totalMessages: number;
    sessionsToday: number;
    lastMessage: Date;
  }>;
}
```

**Database Schema:**
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  date TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  session_type TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  is_active BOOLEAN DEFAULT 1,
  entry_generated BOOLEAN DEFAULT 0
);

CREATE INDEX idx_messages_date ON messages(date);
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_sessions_date ON sessions(date);
```

---

## User Interface Components

### 1. Chat Interface (`ChatInterface.tsx`)

**Layout:**
```
┌─────────────────────────────────┐
│  [←]  Journal Chat              │  ← Header
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────┐        │
│  │ How was your day?   │        │  ← Claude
│  └─────────────────────┘        │
│                                 │
│        ┌──────────────────────┐ │
│        │ Pretty good! Went    │ │  ← User
│        │ climbing with Nate   │ │
│        └──────────────────────┘ │
│                                 │
│  ┌─────────────────────┐        │
│  │ Nice! How was it?   │        │
│  └─────────────────────┘        │
│                                 │
├─────────────────────────────────┤
│  [🎤]  Type a message...  [→]  │  ← Input
└─────────────────────────────────┘
```

**Features:**
- Auto-scroll to latest message
- Show typing indicator when AI is responding
- Voice input button (microphone icon)
- Session indicator showing which check-in (midday/evening)
- Timestamps on messages
- Pull to refresh (loads older messages)

**Voice Input:**
- Press and hold microphone button to record
- Show waveform animation while recording
- Auto-send on release OR have send button
- Use `@react-native-voice/voice` library
- Handle permissions gracefully

---

### 2. Review Screen (`ReviewScreen.tsx`)

**Layout:**
```
┌─────────────────────────────────┐
│  [←]  Review Entry - 2/23/26    │
├─────────────────────────────────┤
│  [Markdown] [Preview]           │  ← Toggle tabs
├─────────────────────────────────┤
│                                 │
│  Today was pretty good! Went    │
│  [[Climbing]] with [[Nate       │
│  Stapleton]] at the gym. We     │
│  worked on some harder routes   │
│  and it felt great.             │
│                                 │
│  Later had dinner with [[Skye]] │
│  and [[Lu]] at a new Thai place │
│  downtown. The pad thai was     │
│  incredible.                    │
│                                 │
│  ### [[Gratitude]] Corner       │
│  - grateful for good friends    │
│  - the climbing felt great      │
│                                 │
├─────────────────────────────────┤
│  [Edit Entry]  [Regenerate]     │
│  [✓ Looks Good, Save It]        │  ← Actions
└─────────────────────────────────┘
```

**Features:**
- Toggle between raw Markdown and rendered preview
- Edit button opens editable text area
- Regenerate asks Gemini to rewrite entry
- "Looks Good" saves to vault and shows confirmation
- Swipe down to dismiss and save for later
- Show wiki-links as clickable (visual only, for preview)

**Edit Mode:**
- Full-screen text editor
- Markdown syntax highlighting (optional)
- Save/Cancel buttons
- Auto-save draft locally

---

### 3. Settings Screen (`SettingsScreen.tsx`)

**Sections:**

**Vault Configuration:**
```
Obsidian Vault Path
┌─────────────────────────────────┐
│ /storage/emulated/0/Documents/  │
│ Obsidian/                       │
└─────────────────────────────────┘
[Browse...] [Test Connection]

Daily Notes Folder (within vault)
┌─────────────────────────────────┐
│ Daily Notes/                    │
└─────────────────────────────────┘
```

**Notification Settings:**
```
Midday Check-in
┌─────────────────────────────────┐
│ Between 12:00 PM - 3:00 PM      │
└─────────────────────────────────┘

Evening Reflection
┌─────────────────────────────────┐
│ 9:00 PM                         │
└─────────────────────────────────┘

[Enable Notifications] ☑

[Test Notification]
```

**API Configuration:**
```
Google Gemini API Key
┌─────────────────────────────────┐
│ •••••••••••••••••••••••••••••   │
└─────────────────────────────────┘
[How to get API key]

Connection Status: ✓ Connected
Last sync: 2 minutes ago
```

**Vault Management:**
```
Wiki-Links Database
Last scanned: Today at 2:30 PM
Total links: 247
[Re-scan Vault Now]

Clear conversation history: [Clear]
Export settings: [Export]
```

**About:**
```
App Version: 1.0.0
[Privacy Policy]
[Send Feedback]
```

---

## Data Flow Diagrams

### Daily Flow

```
8:00 AM - App starts, schedules today's notifications
    ↓
12:00-3:00 PM - Random time selected (e.g., 1:37 PM)
    ↓
1:37 PM - Notification: "How's your day going?"
    ↓
User replies inline: "Pretty good, went climbing"
    ↓
Message → GeminiService → Response
    ↓
1:38 PM - Notification: "Nice! Who'd you climb with?"
    ↓
User replies: "Just Nate"
    ↓
Back and forth continues (2-5 exchanges)
    ↓
30 minutes of no response OR user says "that's it"
    ↓
Session ends, messages saved to DB
    ↓
9:00 PM - Evening notification: "Ready to wrap up your day?"
    ↓
[Same conversation flow]
    ↓
Evening session ends
    ↓
9:30 PM - Notification: "Your entry is ready to review"
    ↓
User opens app → Review screen
    ↓
Approve entry
    ↓
Entry saved to vault: 2_23_26.md
    ↓
Vault scanned for new wiki-links
    ↓
Database updated
    ↓
Done!
```

### Entry Generation Flow

```
User approves in evening
    ↓
ConversationService.getTodaysMessages()
    ↓
Filter messages where date = today
    ↓
WikiLinkService.loadLinks()
    ↓
GeminiService.generateEntry(messages, links)
    ↓
Gemini receives:
  - Today's conversation transcript
  - Existing wiki-links to use
  - User's writing style prompt
  - Date context
    ↓
Gemini generates Markdown entry
    ↓
WikiLinkService.autoLinkText(entry)
    ↓
Entry with proper [[links]] formatting
    ↓
Show in Review Screen
    ↓
User approves
    ↓
VaultService.writeEntry(date, content)
    ↓
File written to vault
    ↓
Scan new links from entry
    ↓
Update database
```

---

## Key Implementation Details

### 1. Notification Inline Reply (Android)

```typescript
import PushNotification from 'react-native-push-notification';

// Create notification with inline reply
PushNotification.localNotification({
  channelId: "journal-chat",
  title: "Journal",
  message: "How's your day going?",
  actions: ["REPLY"],
  reply_placeholder_text: "Type your response...",
  reply_button_text: "Send",
  userInfo: { 
    sessionId: session.id,
    type: 'question'
  }
});

// Handle reply
PushNotification.configure({
  onNotification: function(notification) {
    if (notification.action === 'REPLY') {
      const userReply = notification.reply_text;
      const sessionId = notification.data.sessionId;
      
      // Process reply
      handleUserMessage(userReply, sessionId);
    }
  }
});
```

### 2. Voice Input Integration

```typescript
import Voice from '@react-native-voice/voice';

class VoiceInputComponent extends React.Component {
  componentDidMount() {
    Voice.onSpeechResults = this.onSpeechResults;
    Voice.onSpeechError = this.onSpeechError;
  }
  
  startListening = async () => {
    try {
      await Voice.start('en-US');
    } catch (e) {
      console.error(e);
    }
  };
  
  onSpeechResults = (e) => {
    const text = e.value[0];
    this.props.onTextReceived(text);
  };
  
  render() {
    return (
      <TouchableOpacity 
        onPressIn={this.startListening}
        onPressOut={Voice.stop}
      >
        <MicrophoneIcon />
      </TouchableOpacity>
    );
  }
}
```

### 3. Gemini API Call Example

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  
  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-pro" 
    });
  }
  
  async sendMessage(
    userMessage: string,
    context: ConversationContext
  ): Promise<string> {
    // Build chat history for context
    const chat = this.model.startChat({
      history: context.messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      })),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
      },
    });
    
    const result = await chat.sendMessage(userMessage);
    const response = await result.response;
    return response.text();
  }
  
  async generateEntry(
    messages: Message[],
    wikiLinks: WikiLink[]
  ): Promise<string> {
    const prompt = this.buildEntryPrompt(messages, wikiLinks);
    
    const result = await this.model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3, // More consistent for formatting
        maxOutputTokens: 2000,
      }
    });
    
    return result.response.text();
  }
  
  private buildEntryPrompt(
    messages: Message[],
    wikiLinks: WikiLink[]
  ): string {
    const conversation = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    
    const linksStr = wikiLinks
      .map(l => l.text)
      .join(', ');
    
    return `Generate a journal entry based ONLY on this conversation from ${new Date().toLocaleDateString()}:

${conversation}

Writing style: Natural, conversational, stream-of-consciousness prose
Format: Free-form paragraphs

Use [[Name]] for people (full names like [[Nate Stapleton]])
Use [[Topic]] for topics, places, concepts  
Reference dates as [[M.DD.YY]]
Add "### [[Gratitude]] Corner" if gratitude mentioned

Known wiki-links to use: ${linksStr}

Generate the entry:`;
  }
}
```

### 4. File Writing to Vault

```typescript
import RNFS from 'react-native-fs';
import { PermissionsAndroid } from 'react-native';

class VaultService {
  async writeEntry(date: Date, content: string): Promise<boolean> {
    try {
      // Request permissions if needed
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
      );
      
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('Storage permission denied');
      }
      
      // Build file path
      const filename = this.formatFilename(date);
      const filepath = `${this.config.vaultPath}/${this.config.dailyNotesPath}/${filename}`;
      
      // Check if file exists
      const exists = await RNFS.exists(filepath);
      if (exists) {
        // Optionally: prompt user to overwrite
        console.warn('Entry already exists for this date');
      }
      
      // Write file
      await RNFS.writeFile(filepath, content, 'utf8');
      
      return true;
    } catch (error) {
      console.error('Failed to write entry:', error);
      return false;
    }
  }
  
  private formatFilename(date: Date): string {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear() % 100;
    return `${month}_${day}_${year}.md`;
  }
}
```

### 5. Wiki-Link Scanning

```typescript
class VaultService {
  async scanVaultForLinks(): Promise<WikiLink[]> {
    const links: Map<string, WikiLink> = new Map();
    const wikiLinkPattern = /\[\[([^\]]+)\]\]/g;
    
    try {
      // Get all .md files in vault
      const files = await this.getAllMarkdownFiles(
        this.config.vaultPath
      );
      
      // Read each file
      for (const filepath of files) {
        const content = await RNFS.readFile(filepath, 'utf8');
        
        // Extract wiki-links
        let match;
        while ((match = wikiLinkPattern.exec(content)) !== null) {
          const linkText = match[1];
          
          if (links.has(linkText)) {
            // Increment frequency
            const link = links.get(linkText)!;
            link.frequency++;
            link.lastUsed = new Date();
          } else {
            // New link
            links.set(linkText, {
              text: linkText,
              type: this.categorizeLink(linkText),
              frequency: 1,
              aliases: this.generateAliases(linkText),
              firstSeen: new Date(),
              lastUsed: new Date()
            });
          }
        }
      }
      
      return Array.from(links.values());
    } catch (error) {
      console.error('Failed to scan vault:', error);
      return [];
    }
  }
  
  private async getAllMarkdownFiles(dir: string): Promise<string[]> {
    let files: string[] = [];
    
    const items = await RNFS.readDir(dir);
    
    for (const item of items) {
      if (item.isDirectory()) {
        // Recursively scan subdirectories
        const subFiles = await this.getAllMarkdownFiles(item.path);
        files = files.concat(subFiles);
      } else if (item.name.endsWith('.md')) {
        files.push(item.path);
      }
    }
    
    return files;
  }
  
  private categorizeLink(text: string): WikiLink['type'] {
    // Simple heuristics for categorization
    if (/^\d+\.\d+\.\d+$/.test(text)) return 'date';
    if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(text)) return 'person';
    if (/National Park|2025|Park$/i.test(text)) return 'place';
    // Add more rules as needed
    return 'unknown';
  }
  
  private generateAliases(text: string): string[] {
    const aliases: string[] = [];
    
    // For "Nate Stapleton", add "Nate" and "Stapleton"
    if (text.includes(' ')) {
      const parts = text.split(' ');
      aliases.push(parts[0]); // First name
      if (parts.length === 2) {
        aliases.push(parts[1]); // Last name
      }
    }
    
    // Lowercase version
    aliases.push(text.toLowerCase());
    
    return aliases;
  }
}
```

---

## App Initialization Flow

### First Launch

```
1. Welcome Screen
   "Welcome to Smart Journal!"
   [Get Started]
   
2. Permissions Request
   - Notifications
   - Storage (read/write)
   - Microphone (for voice input)
   
3. API Key Setup
   "Connect to Google Gemini"
   [Enter API Key]
   [How to get a free API key] (link to instructions)
   [Test Connection]
   
4. Vault Setup
   "Where is your Obsidian vault?"
   [Browse Files]
   Selected: /storage/emulated/0/Documents/Obsidian
   [Test Write] (creates test file)
   
5. Vault Scanning
   "Scanning your vault for wiki-links..."
   Progress: 45/120 files
   Found: 247 unique links
   [Continue]
   
6. Notification Setup
   "When should I check in?"
   Midday: [12:00 PM] - [3:00 PM]
   Evening: [9:00 PM]
   [Save Preferences]
   
7. Tutorial
   "Here's how it works:"
   - You'll get notifications to journal
   - Reply right from the notification
   - Review your entry each evening
   - It saves automatically to Obsidian
   [Start Journaling]
   
8. Home Screen
   [Ready for your first entry]
```

### Subsequent Launches

```
- Show home screen with today's status
- "No entries yet today" or "2 sessions completed"
- Quick access to:
  - Start journaling now
  - View today's draft
  - Settings
```

---

## Error Handling & Edge Cases

### API Errors

```typescript
// Retry logic for transient failures
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Exponential backoff
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// Graceful degradation
class GeminiService {
  async sendMessage(message: string): Promise<string> {
    try {
      return await retryWithBackoff(
        () => this.model.generateContent(message)
      );
    } catch (error) {
      // Log error for debugging
      console.error('Gemini API error:', error);
      
      // Return fallback response
      return "I'm having trouble connecting right now. Your message has been saved and I'll respond when I can connect.";
    }
  }
}
```

### Storage Errors

```typescript
// Check available space before writing
async function checkDiskSpace(): Promise<boolean> {
  const diskSpace = await RNFS.getFSInfo();
  const required = 10 * 1024 * 1024; // 10 MB
  return diskSpace.freeSpace > required;
}

// Backup failed entries
async function backupEntry(entry: string): Promise<void> {
  const backupPath = `${RNFS.DocumentDirectoryPath}/backup_entries.json`;
  
  const backups = await RNFS.exists(backupPath)
    ? JSON.parse(await RNFS.readFile(backupPath))
    : [];
  
  backups.push({
    date: new Date().toISOString(),
    content: entry
  });
  
  await RNFS.writeFile(backupPath, JSON.stringify(backups));
}
```

### Network Issues

```typescript
// Queue messages when offline
class OfflineQueue {
  private queue: Message[] = [];
  
  async add(message: Message): Promise<void> {
    this.queue.push(message);
    await this.persist();
  }
  
  async processQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const message = this.queue[0];
      
      try {
        await this.sendToAPI(message);
        this.queue.shift();
        await this.persist();
      } catch (error) {
        // Still offline, stop processing
        break;
      }
    }
  }
  
  private async persist(): Promise<void> {
    await AsyncStorage.setItem(
      'offline_queue',
      JSON.stringify(this.queue)
    );
  }
}
```

### Session Timeout Edge Cases

```typescript
// Handle user returning after timeout
class SessionManager {
  async checkSession(sessionId: string): Promise<Session> {
    const session = await this.getSession(sessionId);
    
    if (!session.isActive) {
      // Session ended, create new one
      return this.createNewSession(session.sessionType);
    }
    
    const timeSinceLastMessage = 
      Date.now() - session.lastInteraction.getTime();
    
    if (timeSinceLastMessage > 30 * 60 * 1000) {
      // Timeout exceeded
      await this.endSession(sessionId);
      
      // Ask if they want to continue
      return this.promptContinue(session);
    }
    
    return session;
  }
  
  private async promptContinue(oldSession: Session): Promise<Session> {
    // Send notification: "Still want to journal? Starting fresh session"
    return this.createNewSession(oldSession.sessionType);
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// GeminiService.test.ts
describe('GeminiService', () => {
  it('should format entry generation prompt correctly', () => {
    const service = new GeminiService('test-key');
    const messages = [
      { role: 'user', content: 'Went climbing today' },
      { role: 'assistant', content: 'How was it?' },
      { role: 'user', content: 'Really fun!' }
    ];
    
    const prompt = service.buildEntryPrompt(messages, []);
    expect(prompt).toContain('Went climbing today');
    expect(prompt).toContain('### [[Gratitude]]');
  });
});

// WikiLinkService.test.ts
describe('WikiLinkService', () => {
  it('should match full names to aliases', () => {
    const service = new WikiLinkService();
    service.addLink('Nate Stapleton', 'person');
    
    const match = service.findMatch('Nate');
    expect(match?.text).toBe('Nate Stapleton');
  });
  
  it('should categorize links correctly', () => {
    const service = new WikiLinkService();
    
    expect(service.categorizeLink('9.14.25')).toBe('date');
    expect(service.categorizeLink('John Smith')).toBe('person');
    expect(service.categorizeLink('Climbing')).toBe('topic');
  });
});
```

### Integration Tests

```typescript
// Full flow test
describe('Journal Entry Flow', () => {
  it('should create entry from conversation', async () => {
    const conversationService = new ConversationService();
    const geminiService = new GeminiService('test-key');
    const vaultService = new VaultService();
    
    // Simulate conversation
    await conversationService.addMessage(
      'session1',
      'user',
      'Went climbing with Nate'
    );
    
    await conversationService.addMessage(
      'session1',
      'assistant',
      'How was it?'
    );
    
    await conversationService.addMessage(
      'session1',
      'user',
      'Really fun, got stronger'
    );
    
    // Generate entry
    const messages = await conversationService.getTodaysMessages();
    const entry = await geminiService.generateEntry(messages, []);
    
    // Verify format
    expect(entry).toContain('[[Climbing]]');
    expect(entry).toContain('[[Nate');
    
    // Save entry
    const success = await vaultService.writeEntry(
      new Date(),
      entry
    );
    
    expect(success).toBe(true);
  });
});
```

### Manual Testing Checklist

```
□ First-time setup flow
  □ API key validation
  □ Vault path selection
  □ Vault scanning completes
  □ Permissions granted

□ Notifications
  □ Midday notification arrives in window
  □ Evening notification arrives on time
  □ Inline reply works
  □ Follow-up notifications appear
  □ 30-minute timeout works

□ Conversation
  □ Messages send successfully
  □ Responses are relevant
  □ Voice input works
  □ Context maintained across messages

□ Entry Generation
  □ Entry matches user's style
  □ Wiki-links formatted correctly
  □ Gratitude section added when appropriate
  □ Only today's messages included

□ Review & Edit
  □ Markdown displays correctly
  □ Preview renders properly
  □ Edit mode works
  □ Regenerate function works

□ File Writing
  □ Entry saves to correct location
  □ Filename format is correct (M_D_YY.md)
  □ Overwrites handled appropriately
  □ Permissions work

□ Edge Cases
  □ No internet connection
  □ API errors
  □ Storage full
  □ Duplicate entries
  □ Session timeout
  □ App killed mid-conversation
```

---

## Performance Optimization

### Database Queries

```typescript
// Use indexes for common queries
CREATE INDEX idx_messages_date ON messages(date);
CREATE INDEX idx_sessions_active ON sessions(is_active);

// Batch inserts
async function batchInsertMessages(messages: Message[]): Promise<void> {
  const values = messages.map(m => 
    `('${m.id}', '${m.sessionId}', '${m.role}', '${m.content}', '${m.timestamp}', '${m.date}')`
  ).join(',');
  
  await db.executeSql(
    `INSERT INTO messages (id, session_id, role, content, timestamp, date) 
     VALUES ${values}`
  );
}
```

### Caching

```typescript
// Cache wiki-links in memory
class WikiLinkService {
  private cache: Map<string, WikiLink> = new Map();
  private cacheExpiry: Date;
  
  async loadLinks(): Promise<void> {
    // Check if cache is still valid
    if (this.cache.size > 0 && new Date() < this.cacheExpiry) {
      return;
    }
    
    // Load from database
    const links = await db.getAllWikiLinks();
    
    this.cache.clear();
    links.forEach(link => this.cache.set(link.text, link));
    
    // Cache for 1 hour
    this.cacheExpiry = new Date(Date.now() + 60 * 60 * 1000);
  }
}
```

### Lazy Loading

```typescript
// Only load visible messages in chat
class ChatInterface extends React.Component {
  state = {
    messages: [],
    page: 0,
    loading: false
  };
  
  async loadMoreMessages() {
    if (this.state.loading) return;
    
    this.setState({ loading: true });
    
    const newMessages = await conversationService.getMessages(
      this.state.page * 20,
      20
    );
    
    this.setState({
      messages: [...this.state.messages, ...newMessages],
      page: this.state.page + 1,
      loading: false
    });
  }
  
  render() {
    return (
      <FlatList
        data={this.state.messages}
        onEndReached={this.loadMoreMessages}
        onEndReachedThreshold={0.5}
      />
    );
  }
}
```

---

## Security Considerations

### API Key Storage

```typescript
// Use encrypted storage for API key
import * as Keychain from 'react-native-keychain';

async function saveAPIKey(key: string): Promise<void> {
  await Keychain.setGenericPassword('gemini_api_key', key);
}

async function getAPIKey(): Promise<string | null> {
  const credentials = await Keychain.getGenericPassword();
  return credentials ? credentials.password : null;
}
```

### File Permissions

```typescript
// Validate vault path is within allowed directories
function isValidVaultPath(path: string): boolean {
  const allowedPaths = [
    '/storage/emulated/0/Documents',
    '/storage/emulated/0/Download',
    RNFS.ExternalStorageDirectoryPath
  ];
  
  return allowedPaths.some(allowed => path.startsWith(allowed));
}
```

### Data Privacy

- All data stored locally on device
- API calls go to Google (Gemini) - user should be aware
- No analytics or tracking
- No cloud backup by default
- Clear data option in settings

---

## Deployment

### Android Build Configuration

```json
// app.json
{
  "expo": {
    "name": "Smart Journal",
    "slug": "smart-journal",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "android": {
      "package": "com.smartjournal.app",
      "versionCode": 1,
      "permissions": [
        "WRITE_EXTERNAL_STORAGE",
        "READ_EXTERNAL_STORAGE",
        "POST_NOTIFICATIONS",
        "RECORD_AUDIO"
      ],
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FFFFFF"
      }
    }
  }
}
```

### Build Steps

```bash
# Install dependencies
npm install

# Build Android APK
npx expo build:android -t apk

# Or build AAB for Play Store
npx expo build:android -t app-bundle

# For development
npx expo run:android
```

---

## Future Enhancements (Post-MVP)

### Phase 2 Features
- Photo attachments in journal entries
- Location tagging (auto-add place names)
- Mood tracking integration
- Search past entries
- Export entries (PDF, DOCX)
- Sync across devices (optional cloud backup)

### Phase 3 Features
- AI-powered insights ("You've mentioned climbing 12 times this month")
- Suggested journal prompts based on history
- Integration with other apps (Calendar, Photos)
- Custom AI personality/tone
- Multi-language support

### Advanced Features
- Voice-only journaling mode (fully hands-free)
- Wearable device integration
- Automatic topic extraction and tagging
- Relationship graph visualization
- Goal tracking and progress monitoring

---

## Development Timeline Estimate

### Week 1: Foundation
- Day 1-2: Project setup, basic UI structure
- Day 3-4: Gemini API integration, basic chat
- Day 5: Notification system basics
- Day 6-7: Database setup, conversation storage

### Week 2: Core Features
- Day 8-9: Wiki-link service, vault scanning
- Day 10-11: Entry generation, review screen
- Day 12-13: File writing, vault integration
- Day 14: Settings screen, configuration

### Week 3: Polish & Testing
- Day 15-16: Voice input, inline notifications
- Day 17-18: Bug fixes, edge cases
- Day 19-20: UI polish, animations
- Day 21: Testing, final adjustments

**Total: ~3 weeks for MVP**

---

## Success Criteria

The app is ready for use when:

✓ User can receive and reply to notifications inline
✓ Conversations flow naturally with Gemini
✓ Entries match user's existing journal style
✓ Wiki-links are correctly detected and formatted
✓ Files save successfully to Obsidian vault
✓ Voice input works reliably
✓ No data loss in edge cases (crashes, etc.)
✓ Settings persist correctly
✓ Vault scanning completes in <30 seconds
✓ App feels responsive (<1s for most actions)

---

## Getting Help / API Key Setup

### Google Gemini API Key (Free Tier)

1. Go to https://makersuite.google.com/app/apikey
2. Sign in with Google account
3. Click "Create API Key"
4. Copy the key (starts with "AIza...")
5. Paste into app settings

**Free Tier Limits:**
- 60 requests per minute
- Plenty for personal journaling use
- No credit card required

### Obsidian Setup

1. Install Obsidian on Android
2. Create or open existing vault
3. Note the vault path:
   - Settings → About → Vault path
   - Usually: `/storage/emulated/0/Documents/Obsidian/[VaultName]`
4. Ensure daily notes folder exists
5. Grant storage permissions to app

---

## Troubleshooting Guide

**Notifications not appearing:**
- Check notification permissions in Android settings
- Ensure battery optimization is off for the app
- Verify notification times in app settings

**Can't save to vault:**
- Check storage permissions
- Verify vault path is correct
- Ensure enough free space (>10 MB)
- Try test write in settings

**API errors:**
- Verify API key is correct
- Check internet connection
- Ensure not hitting rate limits (60/min)
- Check Google Cloud Console for API status

**Wiki-links not working:**
- Re-scan vault in settings
- Check that links use [[double brackets]]
- Verify files are .md format

**Voice input not working:**
- Check microphone permission
- Ensure device has internet (for speech-to-text)
- Try force-closing and reopening app

---

## Code Quality Guidelines

### TypeScript
- Use strict mode
- Define interfaces for all data structures
- Avoid `any` type
- Use async/await over promises

### React Native
- Functional components with hooks
- Proper error boundaries
- Optimize re-renders with React.memo
- Use TypeScript for props

### Code Style
- ESLint + Prettier for formatting
- Meaningful variable names
- Comments for complex logic
- Keep functions small (<50 lines)

### Git Workflow
- Commit messages: "feat:", "fix:", "refactor:"
- Feature branches
- Test before merging
- Keep commits atomic

---

## Final Notes

This spec provides a complete blueprint for building the Smart Journal app. The core architecture uses:

1. **Google Gemini** for free, conversational AI
2. **React Native** for cross-platform mobile development
3. **Local storage** for privacy and offline capability
4. **Direct file writing** to Obsidian vault (no sync needed)
5. **Smart wiki-link detection** learned from existing vault

The app is designed to feel like texting a friend who helps you journal, while automatically formatting entries to match your existing Obsidian style.

Key differentiators:
- Inline notification replies (no app opening required)
- Voice input for hands-free journaling
- Learns your wiki-link patterns
- Zero cost (uses free Gemini tier)
- Complete privacy (local storage only)
- Seamless Obsidian integration

Ready to build! 🚀

# Smart Journal — Android App

A conversational journaling Android app that uses Google Gemini AI to create daily journal entries through natural, text-message-style interactions. Entries are saved directly to your Obsidian vault.

## Features

- **Conversational journaling** via smart daily notifications (midday + evening)
- **Google Gemini AI** integration (free tier) for natural conversation and entry generation
- **Voice input** support (via `@react-native-voice/voice`)
- **Wiki-link detection** — learns your existing `[[links]]` from your vault
- **Markdown entry generation** matching your existing Obsidian format
- **Direct file writing** to your Obsidian vault (no sync needed)
- **Entry review and editing** before saving
- **Offline resilience** — queues messages and backups locally

## Project Structure

```
smart-journal/
├── App.tsx                    # Root app with navigation + onboarding
├── app.json                   # Expo configuration
├── package.json
├── src/
│   ├── components/
│   │   ├── ChatInterface.tsx      # Conversational chat UI
│   │   ├── ReviewScreen.tsx       # Entry review, edit, and save
│   │   ├── SettingsScreen.tsx     # API key, vault, notification config
│   │   └── NotificationHandler.tsx # Notification event listener
│   ├── services/
│   │   ├── GeminiService.ts       # Google Gemini API integration
│   │   ├── ConversationService.ts # Session and message management
│   │   ├── WikiLinkService.ts     # Wiki-link detection and suggestion
│   │   ├── VaultService.ts        # Obsidian vault file operations
│   │   └── NotificationService.ts # Notification scheduling
│   ├── database/
│   │   ├── schema.ts              # SQLite schema initialization
│   │   └── queries.ts             # All database query functions
│   ├── utils/
│   │   ├── dateUtils.ts           # Date formatting helpers
│   │   ├── markdownGenerator.ts   # Prompt building, wiki-link extraction
│   │   └── fileSystem.ts          # File system helpers (permissions, I/O)
│   └── types/
│       └── index.ts               # All TypeScript interfaces
└── android/
    ├── build.gradle
    └── app/
        ├── build.gradle
        └── src/main/
            └── AndroidManifest.xml
```

## Setup & Development

### Prerequisites

- Node.js 18+
- Android Studio with Android SDK (API level 29+)
- Expo CLI: `npm install -g expo-cli`
- A Google Gemini API key (free): https://makersuite.google.com/app/apikey
- Obsidian installed on your Android device

### Install dependencies

```bash
npm install
```

### Run on Android device / emulator

```bash
npx expo run:android
```

### Build release APK

```bash
npx expo build:android -t apk
```

### Build Android App Bundle (for Play Store)

```bash
npx expo build:android -t app-bundle
```

## First Launch Flow

1. **Welcome** — brief intro screen
2. **Permissions** — notifications, storage, microphone
3. **API Key** — enter your Gemini API key (tested immediately)
4. **Vault Setup** — enter your Obsidian vault path
5. **Vault Scan** — scans all `.md` files for existing `[[wiki-links]]`
6. **Notification Setup** — schedules daily check-ins
7. **Tutorial** — quick overview of how the app works
8. **Home** — ready to journal!

## Daily Usage Flow

```
12:00–3:00 PM  →  Random notification: "How's your day going?"
                   User replies inline or taps to open chat
                   Back-and-forth conversation (2–5 exchanges)
                   Session ends after 30 min of inactivity

9:00 PM        →  Evening notification: "Ready to wrap up your day?"
                   Another conversation session

~9:30 PM       →  Notification: "Your entry is ready to review"
                   User opens Review screen
                   Reads/edits/approves the AI-generated entry
                   Entry saved as M_D_YY.md in Obsidian vault
```

## Entry Format

Generated entries match Obsidian's daily note format:

```markdown
Today was pretty good! Went [[Climbing]] with [[Nate Stapleton]] at the gym.
We worked on some harder routes and it felt great.

Later had dinner with [[Skye]] and [[Lu]] at a new Thai place downtown.
The pad thai was incredible.

### [[Gratitude]] Corner
- Grateful for good friends
- The climbing session felt amazing
```

## Configuration

All configuration is done in-app via Settings:
- **Gemini API key** — stored securely via `react-native-keychain`
- **Vault path** — e.g. `/storage/emulated/0/Documents/Obsidian/MyVault`
- **Daily Notes folder** — relative path within vault (default: `Daily Notes`)
- **Notification times** — midday window and evening time
- **Re-scan vault** — update the wiki-link database

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo |
| Language | TypeScript (strict) |
| AI | Google Gemini API (`@google/generative-ai`) |
| Database | SQLite (`expo-sqlite`) |
| Storage | Expo FileSystem + AsyncStorage |
| Notifications | Expo Notifications |
| Voice | `@react-native-voice/voice` |
| Security | `react-native-keychain` |

## Android Requirements

- **Minimum**: Android 10 (API level 29)
- **Target**: Android 14 (API level 34)
- **Primary device**: Google Pixel

## Privacy

- All conversation data is stored **locally on device** (SQLite)
- API calls go to Google's Gemini service (user should be aware)
- No analytics, no tracking, no cloud backup by default
- Clear all data at any time via Settings → Clear Conversation History

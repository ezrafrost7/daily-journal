import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ChatInterface from './src/components/ChatInterface';
import ReviewScreen from './src/components/ReviewScreen';
import SettingsScreen from './src/components/SettingsScreen';
import NotificationHandler from './src/components/NotificationHandler';

import { geminiService } from './src/services/GeminiService';
import { vaultService } from './src/services/VaultService';
import { notificationService } from './src/services/NotificationService';
import { wikiLinkService } from './src/services/WikiLinkService';
import { conversationService } from './src/services/ConversationService';
import { getDatabase } from './src/database/schema';

import { formatDisplayDate, toDateString, timeAgo } from './src/utils/dateUtils';
import type { SessionType } from './src/types';

// ─── Screen Types ─────────────────────────────────────────────────────────────

type Screen =
  | 'loading'
  | 'onboarding'
  | 'home'
  | 'chat'
  | 'review'
  | 'settings';

const SETUP_COMPLETE_KEY = '@smart_journal_setup_complete';
const API_KEY_KEY = '@smart_journal_api_key';

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [sessionType, setSessionType] = useState<SessionType>('midday');
  const [homeStats, setHomeStats] = useState({
    sessionsToday: 0,
    lastMessage: null as Date | null,
    hasEntryForToday: false,
  });

  // ─── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
      // Initialize database
      await getDatabase();

      // Load vault config
      await vaultService.loadConfig();

      // Load notification config
      await notificationService.loadConfig();
      await notificationService.setupAndroidChannels();

      // Load API key if saved
      const apiKey = await AsyncStorage.getItem(API_KEY_KEY);
      if (apiKey) {
        geminiService.initialize(apiKey);
      }

      // Check if setup is complete
      const setupDone = await AsyncStorage.getItem(SETUP_COMPLETE_KEY);

      if (setupDone === 'true') {
        await loadHomeStats();
        setScreen('home');
      } else {
        setScreen('onboarding');
      }
    } catch (err) {
      console.error('App init error:', err);
      setScreen('onboarding');
    }
  };

  const loadHomeStats = async () => {
    try {
      const stats = await conversationService.getStats();
      const entryExists = await vaultService.entryExists(new Date());
      setHomeStats({
        sessionsToday: stats.sessionsToday,
        lastMessage: stats.lastMessage,
        hasEntryForToday: entryExists,
      });
    } catch {}
  };

  // ─── Navigation ───────────────────────────────────────────────────────────

  const openChat = (type: SessionType) => {
    setSessionType(type);
    setScreen('chat');
  };

  const openReview = () => setScreen('review');
  const openSettings = () => setScreen('settings');
  const goHome = () => {
    loadHomeStats();
    setScreen('home');
  };

  // ─── Notification Callbacks ───────────────────────────────────────────────

  const handleMiddayNotification = () => openChat('midday');
  const handleEveningNotification = () => openChat('evening');
  const handleFollowUp = (_sessionId: string) => openChat(sessionType);
  const handleEntryReady = (_date: string) => openReview();

  // ─── Screen Routing ───────────────────────────────────────────────────────

  if (screen === 'loading') {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar barStyle="light-content" backgroundColor="#0d0d1a" />
        <Text style={styles.loadingLogo}>📓</Text>
        <Text style={styles.loadingTitle}>Smart Journal</Text>
        <ActivityIndicator size="large" color="#4a4de7" style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (screen === 'onboarding') {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#0d0d1a" />
        <OnboardingFlow
          onComplete={() => {
            loadHomeStats();
            setScreen('home');
          }}
        />
      </>
    );
  }

  if (screen === 'chat') {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <ChatInterface
          sessionType={sessionType}
          onSessionEnd={goHome}
          onNavigateToReview={openReview}
        />
      </>
    );
  }

  if (screen === 'review') {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <ReviewScreen
          date={new Date()}
          onSaved={goHome}
          onDismiss={goHome}
        />
      </>
    );
  }

  if (screen === 'settings') {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <SettingsScreen onBack={goHome} />
      </>
    );
  }

  // Home Screen
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d1a" />
      <NotificationHandler
        onMiddayStart={handleMiddayNotification}
        onEveningStart={handleEveningNotification}
        onFollowUp={handleFollowUp}
        onEntryReady={handleEntryReady}
      />
      <HomeScreen
        stats={homeStats}
        onStartJournal={openChat}
        onReviewEntry={openReview}
        onOpenSettings={openSettings}
        date={new Date()}
      />
    </>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

interface HomeScreenProps {
  stats: { sessionsToday: number; lastMessage: Date | null; hasEntryForToday: boolean };
  onStartJournal: (type: SessionType) => void;
  onReviewEntry: () => void;
  onOpenSettings: () => void;
  date: Date;
}

function HomeScreen({ stats, onStartJournal, onReviewEntry, onOpenSettings, date }: HomeScreenProps) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.homeHeader}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.dateText}>{formatDisplayDate(date)}</Text>
        </View>
        <TouchableOpacity onPress={onOpenSettings} style={styles.settingsBtn}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Today's Status</Text>
          {stats.sessionsToday === 0 ? (
            <Text style={styles.statusMuted}>No journal sessions yet today</Text>
          ) : (
            <Text style={styles.statusText}>
              {stats.sessionsToday} session{stats.sessionsToday !== 1 ? 's' : ''} completed
            </Text>
          )}
          {stats.lastMessage && (
            <Text style={styles.statusMuted}>
              Last message {timeAgo(stats.lastMessage)}
            </Text>
          )}
          {stats.hasEntryForToday && (
            <View style={styles.savedBadge}>
              <Text style={styles.savedBadgeText}>✓ Entry saved to vault</Text>
            </View>
          )}
        </View>

        {/* Journal Actions */}
        <Text style={styles.sectionLabel}>Start Journaling</Text>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => onStartJournal('midday')}
        >
          <Text style={styles.actionIcon}>☀️</Text>
          <View style={styles.actionTextBox}>
            <Text style={styles.actionTitle}>Midday Check-in</Text>
            <Text style={styles.actionDesc}>How's your day going so far?</Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => onStartJournal('evening')}
        >
          <Text style={styles.actionIcon}>🌙</Text>
          <View style={styles.actionTextBox}>
            <Text style={styles.actionTitle}>Evening Reflection</Text>
            <Text style={styles.actionDesc}>Wrap up and reflect on your day</Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

        {/* Review Entry */}
        <Text style={styles.sectionLabel}>Entry</Text>
        <TouchableOpacity style={styles.actionCard} onPress={onReviewEntry}>
          <Text style={styles.actionIcon}>📝</Text>
          <View style={styles.actionTextBox}>
            <Text style={styles.actionTitle}>
              {stats.hasEntryForToday ? 'View Today\'s Entry' : 'Generate & Review Entry'}
            </Text>
            <Text style={styles.actionDesc}>
              {stats.hasEntryForToday
                ? 'Your entry has been saved to Obsidian'
                : 'Review and save your journal entry'}
            </Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Onboarding Flow ──────────────────────────────────────────────────────────

type OnboardingStep =
  | 'welcome'
  | 'permissions'
  | 'api_key'
  | 'vault_setup'
  | 'vault_scan'
  | 'notification_setup'
  | 'tutorial';

function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [vaultPath, setVaultPath] = useState('/storage/emulated/0/Documents/Obsidian');
  const [isLoading, setIsLoading] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });

  const handlePermissions = async () => {
    const notifOk = await notificationService.requestPermissions();
    await notificationService.setupAndroidChannels();
    if (!notifOk) {
      Alert.alert(
        'Notifications',
        'You can enable notifications later in Settings. Some features will be limited without them.',
        [{ text: 'Continue', onPress: () => setStep('api_key') }]
      );
    } else {
      setStep('api_key');
    }
  };

  const handleApiKey = async () => {
    if (!apiKey.trim()) {
      Alert.alert('API Key Required', 'Please enter your Google Gemini API key.');
      return;
    }

    setIsLoading(true);
    geminiService.initialize(apiKey.trim());
    const ok = await geminiService.testConnection();
    setIsLoading(false);

    if (!ok) {
      Alert.alert(
        'Connection Failed',
        'Could not connect to Google Gemini. Check your API key and internet connection.',
        [
          { text: 'Try Again', style: 'cancel' },
          { text: 'Skip', onPress: () => setStep('vault_setup') },
        ]
      );
      return;
    }

    await AsyncStorage.setItem(API_KEY_KEY, apiKey.trim());
    setStep('vault_setup');
  };

  const handleVaultSetup = async () => {
    if (!vaultPath.trim()) {
      Alert.alert('Vault Path Required', 'Please enter your Obsidian vault path.');
      return;
    }

    setIsLoading(true);
    const ok = await vaultService.setVaultPath(vaultPath.trim());
    setIsLoading(false);

    if (!ok) {
      Alert.alert(
        'Vault Not Found',
        'Could not access that path. Make sure Obsidian is installed and the path is correct.',
        [
          { text: 'Try Again', style: 'cancel' },
          {
            text: 'Skip for Now',
            onPress: async () => {
              await vaultService.saveConfig({ vaultPath: vaultPath.trim(), dailyNotesPath: 'Daily Notes' });
              setStep('vault_scan');
            },
          },
        ]
      );
      return;
    }

    setStep('vault_scan');
  };

  const handleVaultScan = async () => {
    setIsLoading(true);
    setScanProgress({ current: 0, total: 0 });

    const count = await vaultService.scanVaultForLinks((current, total) => {
      setScanProgress({ current, total });
    });

    setScanCount(count);
    setIsLoading(false);
    setStep('notification_setup');
  };

  const handleNotificationSetup = async () => {
    await notificationService.scheduleDailyNotifications();
    setStep('tutorial');
  };

  const handleComplete = async () => {
    await AsyncStorage.setItem(SETUP_COMPLETE_KEY, 'true');
    onComplete();
  };

  // ─── Step Renders ──────────────────────────────────────────────────────────

  if (step === 'welcome') {
    return (
      <OnboardingCard
        emoji="📓"
        title="Welcome to Smart Journal"
        subtitle="A journaling companion that helps you reflect through conversation, then saves beautifully formatted entries to your Obsidian vault."
        primaryLabel="Get Started"
        onPrimary={() => setStep('permissions')}
      />
    );
  }

  if (step === 'permissions') {
    return (
      <OnboardingCard
        emoji="🔔"
        title="Allow Permissions"
        subtitle={
          'Smart Journal needs a few permissions:\n\n• Notifications — to send daily check-ins\n• Storage — to write entries to your Obsidian vault\n• Microphone — for voice input (optional)'
        }
        primaryLabel="Grant Permissions"
        onPrimary={handlePermissions}
        secondaryLabel="Skip"
        onSecondary={() => setStep('api_key')}
      />
    );
  }

  if (step === 'api_key') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.onboardingContent}>
          <Text style={styles.onboardingEmoji}>🤖</Text>
          <Text style={styles.onboardingTitle}>Connect to Google Gemini</Text>
          <Text style={styles.onboardingSubtitle}>
            Smart Journal uses Google Gemini AI (free tier) to have conversations and generate your journal entries.
          </Text>
          <TextInput
            style={styles.onboardingInput}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="Paste your API key (AIza...)"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <TouchableOpacity
            style={styles.onboardingLink}
            onPress={() => {
              const { Linking } = require('react-native');
              Linking.openURL('https://makersuite.google.com/app/apikey');
            }}
          >
            <Text style={styles.onboardingLinkText}>How to get a free API key →</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
            onPress={handleApiKey}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Connect & Continue</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'vault_setup') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.onboardingContent}>
          <Text style={styles.onboardingEmoji}>🗂️</Text>
          <Text style={styles.onboardingTitle}>Your Obsidian Vault</Text>
          <Text style={styles.onboardingSubtitle}>
            Where is your Obsidian vault? Smart Journal will save your daily entries there automatically.
          </Text>
          <TextInput
            style={styles.onboardingInput}
            value={vaultPath}
            onChangeText={setVaultPath}
            placeholder="/storage/emulated/0/Documents/Obsidian/MyVault"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.onboardingHint}>
            Tip: In Obsidian → Settings → About → Vault path
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
            onPress={handleVaultSetup}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Set Vault & Continue</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'vault_scan') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.onboardingContent}>
          <Text style={styles.onboardingEmoji}>🔍</Text>
          <Text style={styles.onboardingTitle}>Scan Your Vault</Text>
          <Text style={styles.onboardingSubtitle}>
            Smart Journal will scan your vault to learn your existing wiki-links, so it can use them in future entries.
          </Text>
          {isLoading && (
            <View style={styles.scanBox}>
              <ActivityIndicator color="#4a4de7" />
              <Text style={styles.scanText}>
                {scanProgress.total > 0
                  ? `Scanning ${scanProgress.current}/${scanProgress.total} files...`
                  : 'Scanning vault...'}
              </Text>
            </View>
          )}
          {!isLoading && (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleVaultScan}>
              <Text style={styles.primaryBtnText}>Scan Vault Now</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setStep('notification_setup')}
          >
            <Text style={styles.secondaryBtnText}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'notification_setup') {
    return (
      <OnboardingCard
        emoji="⏰"
        title="Set Up Check-ins"
        subtitle={
          'Smart Journal will notify you twice a day:\n\n☀️  Midday: Random time between 12–3 PM\n🌙  Evening: 9:00 PM\n\nYou can customize these times in Settings.'
        }
        primaryLabel="Enable Notifications"
        onPrimary={handleNotificationSetup}
        secondaryLabel="Set Up Later"
        onSecondary={() => setStep('tutorial')}
      />
    );
  }

  if (step === 'tutorial') {
    return (
      <OnboardingCard
        emoji="✨"
        title="You're All Set!"
        subtitle={
          "Here's how it works:\n\n1️⃣  You'll get a notification to start journaling\n\n2️⃣  Reply right from the notification (or open the app)\n\n3️⃣  In the evening, review and approve your entry\n\n4️⃣  It saves automatically to Obsidian 📓"
        }
        primaryLabel="Start Journaling"
        onPrimary={handleComplete}
      />
    );
  }

  return null;
}

// ─── Onboarding Card ──────────────────────────────────────────────────────────

interface OnboardingCardProps {
  emoji: string;
  title: string;
  subtitle: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

function OnboardingCard({
  emoji,
  title,
  subtitle,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: OnboardingCardProps) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.onboardingContent}>
        <Text style={styles.onboardingEmoji}>{emoji}</Text>
        <Text style={styles.onboardingTitle}>{title}</Text>
        <Text style={styles.onboardingSubtitle}>{subtitle}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onPrimary}>
          <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
        </TouchableOpacity>
        {secondaryLabel && onSecondary && (
          <TouchableOpacity style={styles.secondaryBtn} onPress={onSecondary}>
            <Text style={styles.secondaryBtnText}>{secondaryLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const COLORS = {
  bg: '#0d0d1a',
  header: '#1a1a2e',
  border: '#2a2a4a',
  text: '#e0e0ff',
  muted: '#888',
  accent: '#4a4de7',
  surface: '#1e1e3f',
  good: '#4ade80',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // Loading
  loadingScreen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: { fontSize: 64 },
  loadingTitle: { color: COLORS.text, fontSize: 28, fontWeight: '700', marginTop: 12 },

  // Home
  homeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.header,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  greeting: { color: COLORS.muted, fontSize: 14 },
  dateText: { color: COLORS.text, fontSize: 20, fontWeight: '700', marginTop: 2 },
  settingsBtn: { padding: 8 },
  settingsIcon: { fontSize: 22 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  sectionLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 2,
  },
  statusCard: {
    backgroundColor: COLORS.header,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  statusTitle: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  statusText: { color: COLORS.text, fontSize: 14 },
  statusMuted: { color: COLORS.muted, fontSize: 13 },
  savedBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  savedBadgeText: { color: COLORS.good, fontSize: 12, fontWeight: '600' },
  actionCard: {
    backgroundColor: COLORS.header,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionIcon: { fontSize: 28 },
  actionTextBox: { flex: 1 },
  actionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  actionDesc: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  actionArrow: { color: COLORS.muted, fontSize: 22 },

  // Onboarding
  onboardingContent: {
    flex: 1,
    padding: 28,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  onboardingEmoji: { fontSize: 72, textAlign: 'center' },
  onboardingTitle: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  onboardingSubtitle: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  onboardingHint: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  onboardingInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  onboardingLink: { alignSelf: 'flex-start' },
  onboardingLinkText: {
    color: COLORS.accent,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: COLORS.muted, fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  scanBox: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  scanText: { color: COLORS.muted, fontSize: 14 },
});

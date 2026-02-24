import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  Switch,
  ActivityIndicator,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSettings, NotificationConfig, VaultConfig } from '../types';
import { geminiService } from '../services/GeminiService';
import { vaultService } from '../services/VaultService';
import { notificationService } from '../services/NotificationService';
import { wikiLinkService } from '../services/WikiLinkService';
import { timeAgo } from '../utils/dateUtils';

const SETTINGS_KEY = '@smart_journal_settings';
const API_KEY_KEY = '@smart_journal_api_key';

const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  vault: { vaultPath: '', dailyNotesPath: 'Daily Notes' },
  notifications: {
    middayStart: '12:00',
    middayEnd: '15:00',
    eveningTime: '21:00',
    enabled: true,
  },
  isFirstLaunch: true,
  setupComplete: false,
};

interface SettingsScreenProps {
  onBack?: () => void;
}

export default function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiStatus, setApiStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');
  const [vaultPath, setVaultPath] = useState('');
  const [dailyNotesPath, setDailyNotesPath] = useState('Daily Notes');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [linkCount, setLinkCount] = useState(0);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);

  // ─── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [raw, storedKey] = await Promise.all([
        AsyncStorage.getItem(SETTINGS_KEY),
        AsyncStorage.getItem(API_KEY_KEY),
      ]);

      if (raw) {
        const s = JSON.parse(raw) as AppSettings;
        setSettings(s);
        setVaultPath(s.vault.vaultPath);
        setDailyNotesPath(s.vault.dailyNotesPath);
        setNotifEnabled(s.notifications.enabled);
      }

      if (storedKey) {
        setApiKey(storedKey);
        geminiService.initialize(storedKey);
      }

      const count = await wikiLinkService.getLinkCount();
      setLinkCount(count);

      const lastRaw = await AsyncStorage.getItem('@smart_journal_last_scan');
      if (lastRaw) setLastScan(new Date(lastRaw));
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  // ─── API Key ────────────────────────────────────────────────────────────────

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      Alert.alert('No API Key', 'Please enter your Gemini API key first.');
      return;
    }

    geminiService.initialize(apiKey.trim());
    const ok = await geminiService.testConnection();
    setApiStatus(ok ? 'connected' : 'error');
    Alert.alert(
      ok ? 'Connected!' : 'Connection Failed',
      ok
        ? 'Your Gemini API key is working.'
        : 'Could not connect. Check your key and internet connection.'
    );
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    await AsyncStorage.setItem(API_KEY_KEY, apiKey.trim());
    geminiService.initialize(apiKey.trim());
    Alert.alert('Saved', 'API key saved.');
  };

  // ─── Vault ──────────────────────────────────────────────────────────────────

  const handleTestVault = async () => {
    if (!vaultPath.trim()) {
      Alert.alert('No Path', 'Please enter your vault path.');
      return;
    }

    const valid = await vaultService.validateVaultPath(vaultPath.trim());
    Alert.alert(
      valid ? 'Vault Found!' : 'Vault Not Found',
      valid
        ? 'Smart Journal can read and write to this path.'
        : 'Could not access this path. Check permissions and try again.'
    );
  };

  const handleSaveVault = async () => {
    setIsSaving(true);
    try {
      const config: VaultConfig = {
        vaultPath: vaultPath.trim(),
        dailyNotesPath: dailyNotesPath.trim() || 'Daily Notes',
      };
      await vaultService.saveConfig(config);
      Alert.alert('Saved', 'Vault configuration saved.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Vault Scanning ─────────────────────────────────────────────────────────

  const handleRescan = async () => {
    if (isScanning) return;

    await vaultService.saveConfig({
      vaultPath: vaultPath.trim(),
      dailyNotesPath: dailyNotesPath.trim() || 'Daily Notes',
    });

    setIsScanning(true);
    setScanProgress({ current: 0, total: 0 });

    try {
      const count = await vaultService.scanVaultForLinks((current, total) => {
        setScanProgress({ current, total });
      });

      setLinkCount(count);
      const now = new Date();
      setLastScan(now);
      await AsyncStorage.setItem('@smart_journal_last_scan', now.toISOString());
      Alert.alert('Scan Complete', `Found ${count} unique wiki-links in your vault.`);
    } catch {
      Alert.alert('Scan Failed', 'Could not complete vault scan. Check permissions.');
    } finally {
      setIsScanning(false);
    }
  };

  // ─── Notifications ──────────────────────────────────────────────────────────

  const handleToggleNotifications = async (enabled: boolean) => {
    setNotifEnabled(enabled);

    if (enabled) {
      const granted = await notificationService.requestPermissions();
      if (!granted) {
        setNotifEnabled(false);
        Alert.alert(
          'Permission Denied',
          'Please enable notification permissions in Android Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
    }

    const cfg: NotificationConfig = {
      ...settings.notifications,
      enabled,
    };
    await notificationService.saveConfig(cfg);

    if (enabled) {
      await notificationService.scheduleDailyNotifications(cfg);
    } else {
      await notificationService.cancelAllScheduled();
    }
  };

  const handleTestNotification = async () => {
    const granted = await notificationService.hasPermissions();
    if (!granted) {
      Alert.alert('No Permission', 'Enable notifications in Android Settings first.');
      return;
    }
    await notificationService.sendTestNotification();
    Alert.alert('Sent!', 'Check your notification bar.');
  };

  // ─── Clear Data ─────────────────────────────────────────────────────────────

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Conversation History',
      'This will delete all saved messages. Journal entries in your vault are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            const { resetDatabase } = await import('../database/schema');
            await resetDatabase();
            Alert.alert('Cleared', 'Conversation history has been cleared.');
          },
        },
      ]
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* API Configuration */}
        <Section title="Google Gemini API">
          <Label>API Key</Label>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={apiKeyVisible ? apiKey : apiKey.replace(/./g, '•')}
              onChangeText={setApiKey}
              placeholder="AIza..."
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!apiKeyVisible}
            />
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setApiKeyVisible(v => !v)}
            >
              <Text style={styles.iconBtnText}>{apiKeyVisible ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={handleSaveApiKey}>
              <Text style={styles.btnText}>Save Key</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={handleTestConnection}>
              <Text style={styles.btnText}>Test Connection</Text>
            </TouchableOpacity>
          </View>
          <StatusRow
            label="Status"
            value={
              apiStatus === 'connected'
                ? '✓ Connected'
                : apiStatus === 'error'
                ? '✗ Failed'
                : 'Not tested'
            }
            valueStyle={
              apiStatus === 'connected'
                ? styles.statusGood
                : apiStatus === 'error'
                ? styles.statusBad
                : undefined
            }
          />
          <TouchableOpacity
            onPress={() =>
              Linking.openURL('https://makersuite.google.com/app/apikey')
            }
          >
            <Text style={styles.link}>How to get a free API key →</Text>
          </TouchableOpacity>
        </Section>

        {/* Vault Configuration */}
        <Section title="Obsidian Vault">
          <Label>Vault Path</Label>
          <TextInput
            style={styles.input}
            value={vaultPath}
            onChangeText={setVaultPath}
            placeholder="/storage/emulated/0/Documents/Obsidian/MyVault"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Label>Daily Notes Folder</Label>
          <TextInput
            style={styles.input}
            value={dailyNotesPath}
            onChangeText={setDailyNotesPath}
            placeholder="Daily Notes"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
          />
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={handleTestVault}>
              <Text style={styles.btnText}>Test Connection</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
              onPress={handleSaveVault}
              disabled={isSaving}
            >
              <Text style={styles.btnPrimaryText}>Save</Text>
            </TouchableOpacity>
          </View>
        </Section>

        {/* Wiki-Link Database */}
        <Section title="Wiki-Link Database">
          <StatusRow label="Total links" value={`${linkCount}`} />
          <StatusRow
            label="Last scanned"
            value={lastScan ? timeAgo(lastScan) : 'Never'}
          />
          {isScanning && (
            <View style={styles.scanProgress}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={styles.scanText}>
                {scanProgress.total > 0
                  ? `Scanning... ${scanProgress.current}/${scanProgress.total} files`
                  : 'Scanning...'}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, isScanning && styles.btnDisabled]}
            onPress={handleRescan}
            disabled={isScanning}
          >
            <Text style={styles.btnPrimaryText}>Re-scan Vault Now</Text>
          </TouchableOpacity>
        </Section>

        {/* Notification Settings */}
        <Section title="Notifications">
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Enable Notifications</Text>
            <Switch
              value={notifEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: COLORS.surface, true: COLORS.accent }}
              thumbColor="#fff"
            />
          </View>
          <StatusRow label="Midday window" value="12:00 PM – 3:00 PM" />
          <StatusRow label="Evening time" value="9:00 PM" />
          <TouchableOpacity style={styles.btn} onPress={handleTestNotification}>
            <Text style={styles.btnText}>Send Test Notification</Text>
          </TouchableOpacity>
        </Section>

        {/* Data Management */}
        <Section title="Data Management">
          <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleClearHistory}>
            <Text style={styles.btnDangerText}>Clear Conversation History</Text>
          </TouchableOpacity>
        </Section>

        {/* About */}
        <Section title="About">
          <StatusRow label="App Version" value="1.0.0" />
          <TouchableOpacity
            onPress={() =>
              Linking.openURL('https://github.com/ezrafrost7/daily-journal')
            }
          >
            <Text style={styles.link}>View on GitHub →</Text>
          </TouchableOpacity>
        </Section>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function StatusRow({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: object;
}) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, valueStyle]}>{value}</Text>
    </View>
  );
}

const COLORS = {
  bg: '#0d0d1a',
  header: '#1a1a2e',
  border: '#2a2a4a',
  text: '#e0e0ff',
  muted: '#888',
  accent: '#4a4de7',
  surface: '#1e1e3f',
  danger: '#e74a4a',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.header,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: { padding: 4 },
  backText: { color: COLORS.text, fontSize: 22 },
  headerTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  spacer: { width: 36 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  section: {
    backgroundColor: COLORS.header,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionContent: { padding: 12, gap: 8 },
  label: { color: COLORS.muted, fontSize: 12, marginBottom: 2 },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnText: { color: COLORS.text, fontSize: 13 },
  btnPrimary: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  btnDanger: { backgroundColor: 'transparent', borderColor: COLORS.danger },
  btnDangerText: { color: COLORS.danger, fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
  iconBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconBtnText: { fontSize: 18 },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  statusLabel: { color: COLORS.muted, fontSize: 13 },
  statusValue: { color: COLORS.text, fontSize: 13 },
  statusGood: { color: '#4ade80' },
  statusBad: { color: COLORS.danger },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchLabel: { color: COLORS.text, fontSize: 14 },
  scanProgress: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanText: { color: COLORS.muted, fontSize: 13 },
  link: { color: COLORS.accent, fontSize: 13, textDecorationLine: 'underline' },
});

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { NotificationConfig, Session, SessionType } from '../types';
import { parseTimeString, randomTimeBetween, toDateString } from '../utils/dateUtils';

const CONFIG_KEY = '@smart_journal_notification_config';
const SCHEDULED_KEY = '@smart_journal_scheduled_ids';

const DEFAULT_CONFIG: NotificationConfig = {
  middayStart: '12:00',
  middayEnd: '15:00',
  eveningTime: '21:00',
  enabled: true,
};

// Set handler so notifications display while app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationService {
  private config: NotificationConfig = DEFAULT_CONFIG;

  // ─── Configuration ─────────────────────────────────────────────────────────

  async loadConfig(): Promise<NotificationConfig> {
    try {
      const raw = await AsyncStorage.getItem(CONFIG_KEY);
      if (raw) this.config = JSON.parse(raw);
    } catch {}
    return this.config;
  }

  async saveConfig(config: NotificationConfig): Promise<void> {
    this.config = config;
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }

  getConfig(): NotificationConfig {
    return this.config;
  }

  // ─── Permissions ────────────────────────────────────────────────────────────

  async requestPermissions(): Promise<boolean> {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    return status === 'granted';
  }

  async hasPermissions(): Promise<boolean> {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  }

  // ─── Channel Setup (Android) ────────────────────────────────────────────────

  async setupAndroidChannels(): Promise<void> {
    if (Platform.OS !== 'android') return;

    await Notifications.setNotificationChannelAsync('journal-chat', {
      name: 'Journal Check-ins',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1a1a2e',
      description: 'Daily journaling prompts and responses',
    });

    await Notifications.setNotificationChannelAsync('journal-review', {
      name: 'Entry Ready',
      importance: Notifications.AndroidImportance.DEFAULT,
      description: 'Notifications when your journal entry is ready to review',
    });
  }

  // ─── Scheduling ─────────────────────────────────────────────────────────────

  async scheduleDailyNotifications(config?: NotificationConfig): Promise<void> {
    if (config) await this.saveConfig(config);
    const cfg = this.config;

    if (!cfg.enabled) return;

    // Cancel existing scheduled notifications
    await this.cancelAllScheduled();

    const ids: string[] = [];

    // Midday: random time in window
    const middayTime = randomTimeBetween(cfg.middayStart, cfg.middayEnd);
    const middayId = await this.scheduleAt(middayTime, {
      title: 'Smart Journal',
      body: "How's your day going?",
      data: { type: 'midday_start' },
      channelId: 'journal-chat',
    });
    if (middayId) ids.push(middayId);

    // Evening: fixed time
    const { hours, minutes } = parseTimeString(cfg.eveningTime);
    const eveningTime = new Date();
    eveningTime.setHours(hours, minutes, 0, 0);
    if (eveningTime < new Date()) {
      eveningTime.setDate(eveningTime.getDate() + 1);
    }

    const eveningId = await this.scheduleAt(eveningTime, {
      title: 'Smart Journal',
      body: "Ready to wrap up your day?",
      data: { type: 'evening_start' },
      channelId: 'journal-chat',
    });
    if (eveningId) ids.push(eveningId);

    await AsyncStorage.setItem(SCHEDULED_KEY, JSON.stringify(ids));
  }

  private async scheduleAt(
    date: Date,
    content: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
      channelId?: string;
    }
  ): Promise<string | null> {
    // Skip if time is in the past
    if (date <= new Date()) return null;

    try {
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: content.title,
          body: content.body,
          data: content.data ?? {},
          sound: true,
          ...(Platform.OS === 'android' && { channelId: content.channelId ?? 'journal-chat' }),
        },
        trigger: { date },
      });
    } catch (err) {
      console.error('Failed to schedule notification:', err);
      return null;
    }
  }

  async cancelAllScheduled(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(SCHEDULED_KEY);
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        for (const id of ids) {
          await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
        }
      }
    } catch {}
    await AsyncStorage.removeItem(SCHEDULED_KEY);
  }

  // ─── Session Notifications ──────────────────────────────────────────────────

  /** Send a follow-up question as a notification after the user responds. */
  async sendFollowUpNotification(
    message: string,
    sessionId: string,
    channelId = 'journal-chat'
  ): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Smart Journal',
        body: message,
        data: { type: 'follow_up', sessionId },
        sound: true,
        ...(Platform.OS === 'android' && { channelId }),
      },
      trigger: null, // Immediate
    });
  }

  /** Notify the user that their entry is ready to review. */
  async sendEntryReadyNotification(date: string): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Smart Journal',
        body: 'Your journal entry is ready to review.',
        data: { type: 'entry_ready', date },
        sound: true,
        ...(Platform.OS === 'android' && { channelId: 'journal-review' }),
      },
      trigger: null,
    });
  }

  /** Send a test notification immediately. */
  async sendTestNotification(): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Smart Journal',
        body: 'Test notification from Smart Journal!',
        data: { type: 'test' },
        sound: true,
        ...(Platform.OS === 'android' && { channelId: 'journal-chat' }),
      },
      trigger: null,
    });
  }

  // ─── Session Timeout ────────────────────────────────────────────────────────

  checkSessionTimeout(session: Session): boolean {
    const elapsed = Date.now() - session.lastInteraction.getTime();
    return elapsed > 30 * 60 * 1000;
  }
}

export const notificationService = new NotificationService();
export default notificationService;

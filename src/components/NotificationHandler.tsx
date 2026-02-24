import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import type { Subscription } from 'expo-notifications';

interface NotificationHandlerProps {
  onMiddayStart?: () => void;
  onEveningStart?: () => void;
  onFollowUp?: (sessionId: string) => void;
  onEntryReady?: (date: string) => void;
}

/**
 * NotificationHandler registers listeners for incoming notification events.
 * This is a render-less component that should live near the root of the app.
 */
export default function NotificationHandler({
  onMiddayStart,
  onEveningStart,
  onFollowUp,
  onEntryReady,
}: NotificationHandlerProps) {
  const responseListenerRef = useRef<Subscription>();
  const foregroundListenerRef = useRef<Subscription>();

  useEffect(() => {
    // Listener for notifications received while the app is in the foreground
    foregroundListenerRef.current = Notifications.addNotificationReceivedListener(
      notification => {
        const data = notification.request.content.data as Record<string, unknown>;
        handleNotificationData(data);
      }
    );

    // Listener for when the user taps a notification
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      response => {
        const data = response.notification.request.content.data as Record<string, unknown>;
        handleNotificationData(data);
      }
    );

    // Handle any notification that launched the app
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      handleNotificationData(data);
    });

    return () => {
      if (foregroundListenerRef.current) {
        Notifications.removeNotificationSubscription(foregroundListenerRef.current);
      }
      if (responseListenerRef.current) {
        Notifications.removeNotificationSubscription(responseListenerRef.current);
      }
    };
  }, []);

  function handleNotificationData(data: Record<string, unknown>) {
    const type = data.type as string | undefined;

    switch (type) {
      case 'midday_start':
        onMiddayStart?.();
        break;
      case 'evening_start':
        onEveningStart?.();
        break;
      case 'follow_up':
        if (typeof data.sessionId === 'string') {
          onFollowUp?.(data.sessionId);
        }
        break;
      case 'entry_ready':
        if (typeof data.date === 'string') {
          onEntryReady?.(data.date);
        }
        break;
    }
  }

  // Render-less component
  return null;
}

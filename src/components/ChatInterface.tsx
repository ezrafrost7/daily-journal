import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import type { ChatMessage, SessionType } from '../types';
import { formatTime } from '../utils/dateUtils';
import { conversationService } from '../services/ConversationService';
import { geminiService } from '../services/GeminiService';
import { notificationService } from '../services/NotificationService';

interface ChatInterfaceProps {
  sessionId?: string;
  sessionType?: SessionType;
  onSessionEnd?: () => void;
  onNavigateToReview?: () => void;
}

const TYPING_INDICATOR_ID = '__typing__';

export default function ChatInterface({
  sessionId: propSessionId,
  sessionType = 'midday',
  onSessionEnd,
  onNavigateToReview,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(propSessionId ?? null);
  const [isRecording, setIsRecording] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // ─── Initialization ─────────────────────────────────────────────────────────

  useEffect(() => {
    initSession();
  }, []);

  const initSession = async () => {
    try {
      let session = propSessionId
        ? await conversationService.getSession(propSessionId)
        : await conversationService.getOrCreateSession(sessionType);

      if (!session) {
        session = await conversationService.createSession(sessionType);
      }

      setSessionId(session.id);

      // Load existing messages
      const existing = await conversationService.getSessionMessages(session.id);
      const chatMessages: ChatMessage[] = existing.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));
      setMessages(chatMessages);

      // If fresh session, send opening AI message
      if (existing.length === 0) {
        const opener =
          sessionType === 'midday'
            ? "How's your day going?"
            : "Ready to wrap up your day? How are you feeling?";
        await sendAIMessage(opener, session.id, []);
      }
    } catch (err) {
      console.error('Failed to init chat session:', err);
    }
  };

  // ─── Message Sending ────────────────────────────────────────────────────────

  const sendUserMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !sessionId) return;

    setInputText('');

    const tempId = `user_${Date.now()}`;
    const userMsg: ChatMessage = {
      id: tempId,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    showTypingIndicator();

    try {
      // Persist user message
      const savedMsg = await conversationService.addMessage(sessionId, 'user', text);
      setMessages(prev =>
        prev.map(m => (m.id === tempId ? { ...m, id: savedMsg.id } : m))
      );

      // Get conversation context
      const context = await conversationService.getConversationContext(sessionId);

      // Send to Gemini
      let aiResponse: string;
      try {
        aiResponse = await geminiService.sendMessage(text, context, sessionType);
      } catch {
        aiResponse = geminiService.getFallbackResponse();
      }

      await sendAIMessage(aiResponse, sessionId, []);

      // Check for session wrap-up signals
      if (isConversationEnding(text)) {
        await handleSessionEnd(sessionId);
      }
    } catch (err) {
      hideTypingIndicator();
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  }, [inputText, sessionId, sessionType]);

  const sendAIMessage = async (
    content: string,
    sid: string,
    _previousMessages: ChatMessage[]
  ) => {
    hideTypingIndicator();

    const savedMsg = await conversationService.addMessage(sid, 'assistant', content);
    const aiMsg: ChatMessage = {
      id: savedMsg.id,
      role: 'assistant',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev.filter(m => m.id !== TYPING_INDICATOR_ID), aiMsg]);
  };

  // ─── Session Management ─────────────────────────────────────────────────────

  const isConversationEnding = (text: string): boolean => {
    const endingPhrases = ["that's it", "that's all", "nothing else", "all good", "done", "bye"];
    return endingPhrases.some(phrase => text.toLowerCase().includes(phrase));
  };

  const handleSessionEnd = async (sid: string) => {
    await conversationService.endSession(sid);

    if (sessionType === 'evening') {
      await notificationService.sendEntryReadyNotification(
        new Date().toISOString().split('T')[0]
      );
      Alert.alert(
        'Evening session complete!',
        "Your entry is being prepared. Tap 'Review Entry' to read and save it.",
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Review Entry', onPress: () => onNavigateToReview?.() },
        ]
      );
    } else {
      Alert.alert('Midday check-in saved!', "I'll check back with you this evening.");
    }

    onSessionEnd?.();
  };

  // ─── Typing Indicator ───────────────────────────────────────────────────────

  const showTypingIndicator = () => {
    setIsTyping(true);
    setMessages(prev => [
      ...prev,
      {
        id: TYPING_INDICATOR_ID,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isTyping: true,
      },
    ]);
  };

  const hideTypingIndicator = () => {
    setIsTyping(false);
    setMessages(prev => prev.filter(m => m.id !== TYPING_INDICATOR_ID));
  };

  // ─── Voice Input (placeholder — requires native module) ─────────────────────

  const handleVoicePress = () => {
    Alert.alert(
      'Voice Input',
      'Voice input requires the @react-native-voice/voice native module. Run the app on a physical device after completing setup.',
      [{ text: 'OK' }]
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    if (item.isTyping) {
      return (
        <View style={[styles.messageBubble, styles.aiBubble]}>
          <View style={styles.typingDots}>
            <Text style={styles.typingDot}>●</Text>
            <Text style={[styles.typingDot, styles.typingDotDelay]}>●</Text>
            <Text style={[styles.typingDot, styles.typingDotDelay2]}>●</Text>
          </View>
        </View>
      );
    }

    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.aiRow]}>
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.aiText]}>
            {item.content}
          </Text>
          <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.aiTimestamp]}>
            {formatTime(item.timestamp)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {sessionType === 'midday' ? '☀️ Midday Check-in' : '🌙 Evening Reflection'}
        </Text>
        <Text style={styles.headerSubtitle}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={[styles.voiceButton, isRecording && styles.voiceButtonActive]}
            onPress={handleVoicePress}
            accessibilityLabel="Voice input"
          >
            <Text style={styles.voiceIcon}>🎤</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message..."
            placeholderTextColor="#888"
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={sendUserMessage}
          />

          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isTyping) && styles.sendButtonDisabled]}
            onPress={sendUserMessage}
            disabled={!inputText.trim() || isTyping}
            accessibilityLabel="Send message"
          >
            {isTyping ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendIcon}>→</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const COLORS = {
  bg: '#0d0d1a',
  header: '#1a1a2e',
  userBubble: '#4a4de7',
  aiBubble: '#1e1e3f',
  text: '#e0e0ff',
  muted: '#888',
  border: '#2a2a4a',
  sendBtn: '#4a4de7',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    backgroundColor: COLORS.header,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 2,
  },
  messageList: {
    padding: 12,
    gap: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  messageRow: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  userRow: {
    alignSelf: 'flex-end',
  },
  aiRow: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: COLORS.userBubble,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: COLORS.aiBubble,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  userText: {
    color: '#fff',
  },
  aiText: {
    color: COLORS.text,
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
  },
  userTimestamp: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'right',
  },
  aiTimestamp: {
    color: COLORS.muted,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 4,
  },
  typingDot: {
    color: COLORS.muted,
    fontSize: 10,
  },
  typingDotDelay: {
    opacity: 0.6,
  },
  typingDotDelay2: {
    opacity: 0.3,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.header,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  voiceButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.aiBubble,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  voiceButtonActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  voiceIcon: {
    fontSize: 18,
  },
  textInput: {
    flex: 1,
    color: COLORS.text,
    backgroundColor: COLORS.aiBubble,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.sendBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#2a2a4a',
  },
  sendIcon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import type { Message, WikiLink } from '../types';
import { conversationService } from '../services/ConversationService';
import { geminiService } from '../services/GeminiService';
import { vaultService } from '../services/VaultService';
import { wikiLinkService } from '../services/WikiLinkService';
import { formatShortDate } from '../utils/dateUtils';
import { extractWikiLinks } from '../utils/markdownGenerator';

type Tab = 'markdown' | 'preview';
type Mode = 'view' | 'edit';

interface ReviewScreenProps {
  date?: Date;
  onSaved?: () => void;
  onDismiss?: () => void;
}

export default function ReviewScreen({
  date = new Date(),
  onSaved,
  onDismiss,
}: ReviewScreenProps) {
  const [tab, setTab] = useState<Tab>('markdown');
  const [mode, setMode] = useState<Mode>('view');
  const [entry, setEntry] = useState('');
  const [editBuffer, setEditBuffer] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [wikiLinks, setWikiLinks] = useState<WikiLink[]>([]);

  // ─── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadAndGenerate();
  }, []);

  const loadAndGenerate = async () => {
    setIsGenerating(true);
    try {
      const [todayMsgs, links] = await Promise.all([
        conversationService.getTodaysMessages(),
        wikiLinkService.getAllLinks(),
      ]);
      setMessages(todayMsgs);
      setWikiLinks(links);

      if (todayMsgs.length === 0) {
        setEntry("No conversations recorded today. Start a journaling session first.");
        return;
      }

      const generated = await geminiService.generateEntry(todayMsgs, links, date);
      const linked = await wikiLinkService.autoLinkText(generated);
      setEntry(linked);
      setEditBuffer(linked);
    } catch (err) {
      console.error('Failed to generate entry:', err);
      setEntry('Failed to generate entry. Please try regenerating.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const handleRegenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setMode('view');

    try {
      const regenerated = await geminiService.regenerateEntry(messages, wikiLinks, entry, date);
      const linked = await wikiLinkService.autoLinkText(regenerated);
      setEntry(linked);
      setEditBuffer(linked);
    } catch {
      Alert.alert('Error', 'Failed to regenerate. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEdit = () => {
    setEditBuffer(entry);
    setMode('edit');
    setTab('markdown');
  };

  const handleSaveEdit = () => {
    setEntry(editBuffer);
    setMode('view');
  };

  const handleCancelEdit = () => {
    setEditBuffer(entry);
    setMode('view');
  };

  const handleSaveToVault = async () => {
    if (isSaving) return;

    const config = vaultService.getConfig();
    if (!config) {
      Alert.alert(
        'Vault Not Configured',
        'Please configure your Obsidian vault path in Settings before saving.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Check for existing entry
    const exists = await vaultService.entryExists(date);
    if (exists) {
      Alert.alert(
        'Entry Exists',
        'A journal entry already exists for today. Do you want to overwrite it?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Overwrite', style: 'destructive', onPress: doSave },
        ]
      );
      return;
    }

    await doSave();
  };

  const doSave = async () => {
    setIsSaving(true);
    try {
      const success = await vaultService.writeEntry(date, entry);

      if (success) {
        // Scan new wiki-links from the saved entry
        const newLinks = extractWikiLinks(entry);
        for (const linkText of newLinks) {
          await wikiLinkService.addLink(linkText);
        }

        Alert.alert('Saved!', `Your entry has been saved to your Obsidian vault.`, [
          { text: 'Done', onPress: () => onSaved?.() },
        ]);
      } else {
        Alert.alert(
          'Save Failed',
          'Could not save to your vault. Check your storage permissions and vault path in Settings.',
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Render Helpers ─────────────────────────────────────────────────────────

  const renderMarkdownText = (text: string) => {
    // Highlight [[wiki-links]] and ### headers in a simple text renderer
    return text.split('\n').map((line, i) => {
      if (line.startsWith('### ')) {
        return (
          <Text key={i} style={styles.headerLine}>
            {renderInlineLinks(line.replace('### ', ''))}
            {'\n'}
          </Text>
        );
      }
      return (
        <Text key={i} style={styles.bodyLine}>
          {renderInlineLinks(line)}
          {'\n'}
        </Text>
      );
    });
  };

  const renderInlineLinks = (text: string) => {
    const parts = text.split(/(\[\[[^\]]+\]\])/g);
    return parts.map((part, idx) => {
      if (part.startsWith('[[') && part.endsWith(']]')) {
        return (
          <Text key={idx} style={styles.wikiLink}>
            {part}
          </Text>
        );
      }
      return <Text key={idx}>{part}</Text>;
    });
  };

  // ─── Main Render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onDismiss} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Review Entry</Text>
          <Text style={styles.headerDate}>{formatShortDate(date)}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tabs */}
      {mode === 'view' && (
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'markdown' && styles.tabActive]}
            onPress={() => setTab('markdown')}
          >
            <Text style={[styles.tabText, tab === 'markdown' && styles.tabTextActive]}>
              Markdown
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'preview' && styles.tabActive]}
            onPress={() => setTab('preview')}
          >
            <Text style={[styles.tabText, tab === 'preview' && styles.tabTextActive]}>
              Preview
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {isGenerating ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4a4de7" />
          <Text style={styles.loadingText}>Generating your journal entry...</Text>
        </View>
      ) : mode === 'edit' ? (
        <TextInput
          style={styles.editor}
          value={editBuffer}
          onChangeText={setEditBuffer}
          multiline
          autoFocus
          textAlignVertical="top"
        />
      ) : tab === 'markdown' ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentPadding}>
          <Text style={styles.markdownRaw}>{entry}</Text>
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentPadding}>
          {renderMarkdownText(entry)}
        </ScrollView>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {mode === 'edit' ? (
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.cancelEditBtn} onPress={handleCancelEdit}>
              <Text style={styles.cancelEditText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveEditBtn} onPress={handleSaveEdit}>
              <Text style={styles.saveEditText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.topActions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={handleEdit}
                disabled={isGenerating}
              >
                <Text style={styles.editBtnText}>Edit Entry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.regenerateBtn}
                onPress={handleRegenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.regenerateBtnText}>Regenerate</Text>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
              onPress={handleSaveToVault}
              disabled={isSaving || isGenerating}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>✓ Looks Good, Save It</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const COLORS = {
  bg: '#0d0d1a',
  header: '#1a1a2e',
  border: '#2a2a4a',
  text: '#e0e0ff',
  muted: '#888',
  accent: '#4a4de7',
  wikiLink: '#7c9ef5',
  headerText: '#c0c8ff',
  surface: '#1e1e3f',
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
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  headerDate: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  headerSpacer: { width: 32 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.header,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: COLORS.accent },
  tabText: { color: COLORS.muted, fontSize: 14 },
  tabTextActive: { color: COLORS.text, fontWeight: '600' },
  content: { flex: 1 },
  contentPadding: { padding: 16 },
  markdownRaw: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 22,
  },
  headerLine: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
  },
  bodyLine: { color: COLORS.text, fontSize: 15, lineHeight: 24 },
  wikiLink: { color: COLORS.wikiLink, fontWeight: '500' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.muted, fontSize: 14 },
  editor: {
    flex: 1,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    padding: 16,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 22,
  },
  actions: {
    backgroundColor: COLORS.header,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: 12,
    gap: 10,
  },
  topActions: { flexDirection: 'row', gap: 10 },
  editBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  regenerateBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  regenerateBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  editActions: { flexDirection: 'row', gap: 10 },
  cancelEditBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelEditText: { color: COLORS.muted, fontSize: 14 },
  saveEditBtn: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveEditText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

// Suppress Platform warning in tests
const { Platform: _Platform } = require('react-native');

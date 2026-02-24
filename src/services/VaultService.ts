import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { VaultConfig, WikiLink } from '../types';
import { formatObsidianFilename, toDateString } from '../utils/dateUtils';
import {
  pathExists,
  readTextFile,
  writeTextFile,
  getAllMarkdownFiles,
  hasEnoughDiskSpace,
  backupEntry,
  requestStoragePermissions,
} from '../utils/fileSystem';
import { wikiLinkService } from './WikiLinkService';

const VAULT_CONFIG_KEY = '@smart_journal_vault_config';
const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;
const MAX_RECENT_ENTRIES = 5;

class VaultService {
  private config: VaultConfig | null = null;

  // ─── Configuration ─────────────────────────────────────────────────────────

  async loadConfig(): Promise<VaultConfig | null> {
    if (this.config) return this.config;

    try {
      const raw = await AsyncStorage.getItem(VAULT_CONFIG_KEY);
      if (!raw) return null;
      this.config = JSON.parse(raw) as VaultConfig;
      return this.config;
    } catch {
      return null;
    }
  }

  async saveConfig(config: VaultConfig): Promise<void> {
    this.config = config;
    await AsyncStorage.setItem(VAULT_CONFIG_KEY, JSON.stringify(config));
  }

  async setVaultPath(vaultPath: string, dailyNotesPath = 'Daily Notes'): Promise<boolean> {
    const isValid = await this.validateVaultPath(vaultPath);
    if (!isValid) return false;

    await this.saveConfig({ vaultPath, dailyNotesPath });
    return true;
  }

  // ─── Path Validation ────────────────────────────────────────────────────────

  async validateVaultPath(path: string): Promise<boolean> {
    try {
      const exists = await pathExists(path);
      if (!exists) return false;

      // Try writing a test file
      const testPath = `${path}/.smart_journal_test`;
      const written = await writeTextFile(testPath, 'test');
      if (!written) return false;

      // Clean up test file
      await FileSystem.deleteAsync(testPath, { idempotent: true });
      return true;
    } catch {
      return false;
    }
  }

  isValidVaultPath(path: string): boolean {
    const allowed = [
      '/storage/emulated/0/Documents',
      '/storage/emulated/0/Download',
      '/storage/emulated/0/',
      'file://',
    ];
    return allowed.some(prefix => path.startsWith(prefix)) || path.length > 0;
  }

  // ─── Entry Operations ───────────────────────────────────────────────────────

  private getEntryPath(date: Date): string | null {
    if (!this.config) return null;
    const filename = formatObsidianFilename(date);
    return `${this.config.vaultPath}/${this.config.dailyNotesPath}/${filename}`;
  }

  async entryExists(date: Date): Promise<boolean> {
    const path = this.getEntryPath(date);
    if (!path) return false;
    return pathExists(path);
  }

  async writeEntry(date: Date, content: string): Promise<boolean> {
    if (!this.config) {
      console.error('Vault not configured');
      return false;
    }

    // Permission check
    const hasPermission = await requestStoragePermissions();
    if (!hasPermission) {
      console.error('Storage permission denied');
      return false;
    }

    // Disk space check
    const hasSpace = await hasEnoughDiskSpace();
    if (!hasSpace) {
      // Backup locally before failing
      await backupEntry(toDateString(date), content);
      console.error('Not enough disk space');
      return false;
    }

    const filepath = this.getEntryPath(date);
    if (!filepath) return false;

    // Ensure the daily notes directory exists
    const dirPath = `${this.config.vaultPath}/${this.config.dailyNotesPath}`;
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true }).catch(() => {});

    const success = await writeTextFile(filepath, content);

    if (!success) {
      // Attempt backup on failure
      await backupEntry(toDateString(date), content);
    }

    return success;
  }

  async readEntry(date: Date): Promise<string | null> {
    const path = this.getEntryPath(date);
    if (!path) return null;
    return readTextFile(path);
  }

  // ─── Vault Scanning ─────────────────────────────────────────────────────────

  /**
   * Scan the entire vault for [[wiki-links]] and populate the database.
   * Returns the number of unique links found.
   * Calls onProgress(current, total) for UI progress updates.
   */
  async scanVaultForLinks(
    onProgress?: (current: number, total: number) => void
  ): Promise<number> {
    if (!this.config) return 0;

    const hasPermission = await requestStoragePermissions();
    if (!hasPermission) return 0;

    try {
      const files = await getAllMarkdownFiles(this.config.vaultPath);
      const linksMap = new Map<string, WikiLink>();

      for (let i = 0; i < files.length; i++) {
        onProgress?.(i + 1, files.length);

        const content = await readTextFile(files[i]);
        if (!content) continue;

        let match: RegExpExecArray | null;
        const re = new RegExp(WIKILINK_PATTERN.source, 'g');
        while ((match = re.exec(content)) !== null) {
          const linkText = match[1].trim();
          if (!linkText) continue;

          if (linksMap.has(linkText)) {
            linksMap.get(linkText)!.frequency++;
          } else {
            const type = wikiLinkService.categorizeLink(linkText);
            linksMap.set(linkText, {
              text: linkText,
              type,
              frequency: 1,
              aliases: wikiLinkService.generateAliases(linkText),
              firstSeen: new Date(),
              lastUsed: new Date(),
            });
          }
        }
      }

      const links = Array.from(linksMap.values());
      await wikiLinkService.clearAllLinks();
      await wikiLinkService.bulkAddLinks(links);

      return links.length;
    } catch (err) {
      console.error('Vault scan failed:', err);
      return 0;
    }
  }

  /**
   * Read up to `count` most recent journal entries for style learning.
   */
  async readRecentEntries(count: number = MAX_RECENT_ENTRIES): Promise<string[]> {
    if (!this.config) return [];

    try {
      const dirPath = `${this.config.vaultPath}/${this.config.dailyNotesPath}`;
      const items = await FileSystem.readDirectoryAsync(dirPath);

      const mdFiles = items
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, count);

      const entries: string[] = [];
      for (const file of mdFiles) {
        const content = await readTextFile(`${dirPath}/${file}`);
        if (content) entries.push(content);
      }

      return entries;
    } catch {
      return [];
    }
  }

  /** Return current vault configuration. */
  getConfig(): VaultConfig | null {
    return this.config;
  }
}

export const vaultService = new VaultService();
export default vaultService;

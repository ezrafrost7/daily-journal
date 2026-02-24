import * as FileSystem from 'expo-file-system';
import { Platform, PermissionsAndroid } from 'react-native';

/**
 * Request Android storage permissions.
 * Returns true if granted (or on iOS where not needed).
 */
export async function requestStoragePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const readResult = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      {
        title: 'Storage Permission',
        message: 'Smart Journal needs access to storage to read and write journal entries to your Obsidian vault.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );

    const writeResult = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      {
        title: 'Storage Permission',
        message: 'Smart Journal needs write access to save journal entries to your Obsidian vault.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );

    return (
      readResult === PermissionsAndroid.RESULTS.GRANTED &&
      writeResult === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch (err) {
    console.error('Storage permission error:', err);
    return false;
  }
}

/**
 * Check whether a path exists (file or directory).
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * Read a text file. Returns null if file doesn't exist or on error.
 */
export async function readTextFile(path: string): Promise<string | null> {
  try {
    const exists = await pathExists(path);
    if (!exists) return null;
    return await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
  } catch (err) {
    console.error(`Failed to read file ${path}:`, err);
    return null;
  }
}

/**
 * Write a text file, creating parent directories as needed.
 */
export async function writeTextFile(path: string, content: string): Promise<boolean> {
  try {
    await FileSystem.writeAsStringAsync(path, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return true;
  } catch (err) {
    console.error(`Failed to write file ${path}:`, err);
    return false;
  }
}

/**
 * Recursively list all .md files under a directory.
 */
export async function getAllMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string) {
    try {
      const items = await FileSystem.readDirectoryAsync(current);

      for (const item of items) {
        const fullPath = `${current}/${item}`;
        const info = await FileSystem.getInfoAsync(fullPath);

        if (info.isDirectory) {
          await walk(fullPath);
        } else if (item.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Skip directories we can't read
    }
  }

  await walk(dir);
  return files;
}

/**
 * Get available disk space info. Returns freeSpace in bytes.
 */
export async function getDiskSpaceInfo(): Promise<{ freeSpace: number; totalSpace: number }> {
  try {
    const info = await FileSystem.getFreeDiskStorageAsync();
    return { freeSpace: info, totalSpace: 0 };
  } catch {
    return { freeSpace: Infinity, totalSpace: 0 };
  }
}

/**
 * Validate that there's enough disk space for a write operation.
 * Default threshold: 10 MB.
 */
export async function hasEnoughDiskSpace(requiredBytes = 10 * 1024 * 1024): Promise<boolean> {
  const { freeSpace } = await getDiskSpaceInfo();
  return freeSpace > requiredBytes;
}

/**
 * Save content to an app-internal backup location.
 */
export async function backupEntry(date: string, content: string): Promise<void> {
  try {
    const backupDir = `${FileSystem.documentDirectory}backup_entries/`;
    await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });
    const backupPath = `${backupDir}${date}.md`;
    await writeTextFile(backupPath, content);
  } catch (err) {
    console.error('Backup failed:', err);
  }
}

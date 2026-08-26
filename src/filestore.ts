/**
 * SuperFun — persistent save bridge.
 *
 * Chauvet firmware enforces FILE:READ/WRITE permissions even on raw java.io
 * access to shared storage (MyStyle/…), so writing saves there would either
 * throw a SecurityException (silently losing saves) or require a permission
 * prompt. Instead we keep everything in the plugin's PRIVATE directory
 * (PluginManager.getPluginDirPath() → /data/.../plugins/<pluginID>), which is
 * permission-free and stable across version upgrades. Raw java.io writes there
 * are the app's own data dir, so the native FileStore bridge needs no changes.
 * Falls back to no-op if the bridge or the path is unavailable.
 */
import {NativeModules} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

const FS: any = NativeModules.FileStore;
export const hasFileStore = !!FS;

const SAVES_REL = '/saves.json';
const STATS_REL = '/stats.json';
let baseCache: string | null = null;

async function base(): Promise<string | null> {
  if (!FS) return null;
  if (!baseCache) {
    try {
      const dir = await PluginManager.getPluginDirPath();
      baseCache = dir || null;
    } catch (e) {
      baseCache = null;
    }
  }
  return baseCache;
}
async function savesPath(): Promise<string | null> {
  const b = await base();
  return b ? b + SAVES_REL : null;
}

// --- persistent stats (records, gallery, badges, prefs) ---------------------
export async function loadStats(): Promise<any> {
  try {
    const b = await base();
    if (!b) return null;
    const txt = await FS.readText(b + STATS_REL);
    if (!txt) return null;
    const data = JSON.parse(txt);
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    return null;
  }
}

export async function persistStats(stats: any): Promise<void> {
  try {
    const b = await base();
    if (!b) return;
    await FS.writeText(b + STATS_REL, JSON.stringify(stats));
  } catch (e) {
    // best-effort
  }
}

export async function loadSaves(): Promise<any[]> {
  try {
    const p = await savesPath();
    if (!p) return [];
    const txt = await FS.readText(p);
    if (!txt) return [];
    const data = JSON.parse(txt);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

export async function persistSaves(saves: any[]): Promise<void> {
  try {
    const p = await savesPath();
    if (!p) return;
    await FS.writeText(p, JSON.stringify(saves));
  } catch (e) {
    // ignore — persistence is best-effort
  }
}

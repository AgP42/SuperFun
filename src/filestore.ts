/**
 * SuperFun — persistent save bridge (JSON in MyStyle/Plugins/SuperFun/).
 * Backed by the native FileStore module; degrades to no-op if absent.
 */
import {NativeModules} from 'react-native';

const FS: any = NativeModules.FileStore;
export const hasFileStore = !!FS;

const REL = '/MyStyle/Plugins/SuperFun/saves.json';
const STATS_REL = '/MyStyle/Plugins/SuperFun/stats.json';
let baseCache: string | null = null;

async function base(): Promise<string | null> {
  if (!FS) return null;
  if (!baseCache) baseCache = await FS.getExternalDir();
  return baseCache;
}
async function savesPath(): Promise<string | null> {
  const b = await base();
  return b ? b + REL : null;
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

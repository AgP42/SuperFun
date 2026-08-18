/**
 * SuperFun — persistent save bridge (JSON in MyStyle/Plugins/SuperFun/).
 * Backed by the native FileStore module; degrades to no-op if absent.
 */
import {NativeModules} from 'react-native';

const FS: any = NativeModules.FileStore;
export const hasFileStore = !!FS;

const REL = '/MyStyle/Plugins/SuperFun/saves.json';
let baseCache: string | null = null;

async function savesPath(): Promise<string | null> {
  if (!FS) return null;
  if (!baseCache) baseCache = await FS.getExternalDir();
  return baseCache + REL;
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

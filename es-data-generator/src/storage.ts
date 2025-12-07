import type { Connection } from './esClient';

const STORAGE_KEY = 'esConnections';

export function loadConnections(): Connection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveConnections(conns: Connection[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conns));
}


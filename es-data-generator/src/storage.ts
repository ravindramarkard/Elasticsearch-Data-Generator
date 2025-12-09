import type { Connection } from './esClient';
import type { Mapping, FieldRules } from './generator';

const STORAGE_KEY = 'esConnections';
const GENERATOR_CONFIGS_KEY = 'esGeneratorConfigs';
const LAST_GENERATOR_KEY = 'esLastGenerator';

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

export type GeneratorConfig = {
  id: string;
  name: string;
  mapping: Mapping;
  rules: FieldRules;
  indexName: string;
  docCount: number;
  startDate?: string;
  endDate?: string;
  granularity?: string;
  distribution?: string;
  rate?: number;
  createdAt: string;
  updatedAt: string;
};

export function loadGeneratorConfigs(): GeneratorConfig[] {
  try {
    const raw = localStorage.getItem(GENERATOR_CONFIGS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveGeneratorConfigs(configs: GeneratorConfig[]): void {
  localStorage.setItem(GENERATOR_CONFIGS_KEY, JSON.stringify(configs));
}

export function saveGeneratorConfig(config: GeneratorConfig): void {
  const configs = loadGeneratorConfigs();
  const existingIndex = configs.findIndex(c => c.id === config.id);
  
  if (existingIndex >= 0) {
    configs[existingIndex] = { ...config, updatedAt: new Date().toISOString() };
  } else {
    configs.push({ ...config, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  
  saveGeneratorConfigs(configs);
}

export function deleteGeneratorConfig(id: string): void {
  const configs = loadGeneratorConfigs();
  const filtered = configs.filter(c => c.id !== id);
  saveGeneratorConfigs(filtered);
}

export function loadLastGenerator(): GeneratorConfig | null {
  try {
    const raw = localStorage.getItem(LAST_GENERATOR_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveLastGenerator(config: Partial<GeneratorConfig>): void {
  localStorage.setItem(LAST_GENERATOR_KEY, JSON.stringify(config));
}

// Audit Log Storage
const AUDIT_LOGS_KEY = 'esAuditLogs';

export type AuditEntry = {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  category: 'connection' | 'schema' | 'generation' | 'query' | 'update' | 'delete' | 'system';
  details: string;
  status: 'success' | 'error' | 'warning';
  metadata?: Record<string, unknown>;
};

export function loadAuditLogs(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_LOGS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveAuditLogs(logs: AuditEntry[]): void {
  try {
    localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to save audit logs', e);
  }
}

export function clearAuditLogs(): void {
  try {
    localStorage.removeItem(AUDIT_LOGS_KEY);
  } catch (e) {
    console.error('Failed to clear audit logs', e);
  }
}

export function deleteOldAuditLogs(days: number): number {
  try {
    const logs = loadAuditLogs();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTime = cutoffDate.getTime();
    
    const filteredLogs = logs.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return logTime >= cutoffTime;
    });
    
    const deletedCount = logs.length - filteredLogs.length;
    saveAuditLogs(filteredLogs);
    return deletedCount;
  } catch (e) {
    console.error('Failed to delete old audit logs', e);
    return 0;
  }
}

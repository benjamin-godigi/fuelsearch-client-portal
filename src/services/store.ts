import type { ActivityLog, ClientDirectoryEntry, Customer, DemoUser, ImportBatch, Issue, Role, Transaction } from "../types";
import {
  demoUsers,
  initialActivityLogs,
  initialClientDirectory,
  initialCustomers,
  initialImportBatches,
  initialIssues,
  initialTransactions,
} from "../data/mockData";

const KEY = "fuelsearch-demo-state";

export interface AppState {
  currentUser: DemoUser | null;
  customers: Customer[];
  clientDirectory: ClientDirectoryEntry[];
  transactions: Transaction[];
  issues: Issue[];
  activityLogs: ActivityLog[];
  importBatches: ImportBatch[];
  supportNotificationsSeenAt: string;
}

export const defaultState: AppState = {
  currentUser: null,
  customers: initialCustomers,
  clientDirectory: initialClientDirectory,
  transactions: initialTransactions,
  issues: initialIssues,
  activityLogs: initialActivityLogs,
  importBatches: initialImportBatches,
  supportNotificationsSeenAt: new Date().toISOString(),
};

export function loadState(): AppState {
  const raw = localStorage.getItem(KEY);
  if (!raw) return defaultState;
  try {
    const stored = JSON.parse(raw) as AppState;
    return {
      ...defaultState,
      ...stored,
      transactions: stored.transactions?.length <= 10 ? initialTransactions : stored.transactions,
    };
  } catch {
    return defaultState;
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function loginAs(role: Role): DemoUser {
  return demoUsers.find((user) => user.role === role)!;
}

export function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

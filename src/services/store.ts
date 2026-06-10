import type { ActivityLog, ClientDirectoryEntry, Customer, ImportBatch, Issue, PortalUser, Transaction } from "../types";

export interface AppState {
  currentUser: PortalUser | null;
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
  customers: [],
  clientDirectory: [],
  transactions: [],
  issues: [],
  activityLogs: [],
  importBatches: [],
  supportNotificationsSeenAt: new Date().toISOString(),
};

export function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

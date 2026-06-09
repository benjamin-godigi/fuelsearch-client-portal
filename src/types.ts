export type Role = "super_admin" | "admin" | "customer";
export type TransactionStatus = "Completed" | "Pending" | "Open" | "Expired" | "Cancelled";
export type IssueStatus = "Open" | "In Progress" | "Resolved";
export type IssuePriority = "Low" | "Medium" | "High" | "Urgent";

export interface AdminPermissions {
  manageTransactions: boolean;
  manageUsers: boolean;
  manageSupport: boolean;
  viewActivityLog: boolean;
}

export interface PortalUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  clientName?: string;
  mustChangePassword?: boolean;
}

export interface Customer {
  id: string;
  email: string;
  clientName: string;
  displayName: string;
  role: Role;
  adminPermissions?: AdminPermissions;
  vatNumber?: string;
  address?: string;
  registration?: string;
  clientId?: string;
}

export interface ClientDirectoryEntry {
  id: string;
  clientName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  contactPersonPhone?: string;
  contactPersonEmail?: string;
  pricingTier?: string;
  balance?: number;
  lowBalanceThreshold?: number;
  overageThreshold?: number;
  address?: string;
  createdAt?: string;
}

export interface Transaction {
  id: string;
  order: string;
  clientName: string;
  depot: string;
  vehicle: string;
  vehicleOdoReading?: number;
  driver?: string;
  status: TransactionStatus;
  requestedFuelL?: number;
  filledFuelL?: number;
  parkingNights?: number;
  nightsActual?: number;
  parkingFee?: number;
  parkingCostPrice?: number;
  costPricePerL?: number;
  fuelPricePerL?: number;
  totalCostPrice?: number;
  totalPrice: number;
  profit?: number;
  createdBy?: string;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
  manualOverride?: boolean;
  notes?: string;
}

export type TransactionChangeSource = "Created" | "Import" | "Manual";

export interface TransactionFieldDelta {
  field: string;
  label: string;
  from: string;
  to: string;
}

export interface TransactionChange {
  id: string;
  transactionId?: string;
  orderNumber: string;
  source: TransactionChangeSource;
  changedByEmail: string;
  changedAt: string;
  statusFrom?: string;
  statusTo?: string;
  deltas: TransactionFieldDelta[];
  importBatchId?: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: IssuePriority;
  status: IssueStatus;
  reportedBy: string;
  source: string;
  clientName?: string;
  orderRef?: string;
  resolutionNotes?: string;
  loggedAt: string;
  updatedAt: string;
  customerUpdateAt?: string;
  customerSeenAt?: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  adminEmail: string;
  details: string;
  performedAt: string;
}

export interface ImportBatch {
  id: string;
  filename: string;
  importedAt: string;
  importedBy: string;
  rowsInFile: number;
  imported: number;
  skipped: number;
  droppedInParser: number;
  orderNumbers: string[];
}

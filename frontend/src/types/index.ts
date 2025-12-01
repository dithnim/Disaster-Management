// ============================================
// FRONTEND TYPE DEFINITIONS
// ============================================

export type Severity = "low" | "medium" | "high" | "critical";
export type Status =
  | "new"
  | "claimed"
  | "en_route"
  | "arrived"
  | "rescued"
  | "closed";

// Report from the backend
export interface Report {
  id: string;
  shortCode: string;
  lat: number;
  lng: number;
  message: string;
  severity: Severity;
  status: Status;
  timestamp: number;
  lastUpdate: number;

  // Optional fields
  isMedical?: boolean;
  isFragile?: boolean;
  peopleCount?: number;
  batteryLevel?: number;
  photoUrl?: string;
  source?: "web" | "sms";

  // Rescuer info
  claimedBy?: string;
  claimedByName?: string;
  claimedAt?: number;

  // ETA for victim tracking
  eta?: string;
}

// Rescuer information
export interface Rescuer {
  id: string;
  name: string;
  organization?: string;
  socketId?: string;
  lat?: number;
  lng?: number;
  status?: "active" | "inactive";
  registeredAt?: number;
}

// Location data
export interface Location {
  lat: number;
  lng: number;
  accuracy?: number;
}

// Form state for SOS submission
export interface SOSFormState {
  message: string;
  severity: Severity;
  isMedical: boolean;
  isFragile: boolean;
  peopleCount: number;
  photo: File | null;
  photoPreview: string | null;
}

// Success state after SOS submission
export interface SOSSuccess {
  queued: boolean;
  shortCode?: string;
  id?: string;
  localId?: string;
  message: string;
}

// Queued report for offline storage
export interface QueuedReport {
  lat: number;
  lng: number;
  message: string;
  severity: Severity;
  isMedical?: boolean;
  isFragile?: boolean;
  peopleCount?: number;
  batteryLevel?: number;
  queuedAt: number;
  localId: string;
}

// Filter state for dashboard
export interface DashboardFilter {
  status: Status | "";
  severity: Severity | "";
}

// Stats response from API
export interface StatsResponse {
  total: number;
  activeRescuers: number;
  connectedClients: number;
  byStatus: {
    new: number;
    claimed: number;
    enRoute: number;
    arrived: number;
    rescued: number;
    closed: number;
  };
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  lastUpdate: number;
}

// Socket context value type
export interface SocketContextValue {
  socket: SocketType | null;
  connected: boolean;
  reports: Report[];
  setReports: React.Dispatch<React.SetStateAction<Report[]>>;
  joinAsRescuer: (rescuerInfo: Rescuer) => void;
  trackReport: (shortCode: string) => void;
  updateLocation: (rescuerId: string, lat: number, lng: number) => void;
}

// Offline context value type
export interface OfflineContextValue {
  isOnline: boolean;
  pendingReports: QueuedReport[];
  queueReport: (
    reportData: Omit<QueuedReport, "queuedAt" | "localId">
  ) => QueuedReport;
  removeFromQueue: (localId: string) => void;
  syncPendingReports: () => Promise<void>;
  pendingCount: number;
}

// Status info for tracking page
export interface StatusInfo {
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  step: number;
}

// Socket.io types (basic - can be extended)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SocketType = {
  on: (event: string, callback: (data: any) => void) => void;
  off: (event: string, callback?: (data: any) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
  disconnect: () => void;
  connected: boolean;
};

// Severity option for form
export interface SeverityOption {
  value: Severity;
  label: string;
  color: string;
}

// Progress step for tracking
export interface ProgressStep {
  step: number;
  label: string;
  status: Status;
}

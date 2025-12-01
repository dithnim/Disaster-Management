import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import type { QueuedReport, OfflineContextValue } from "../types";

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function useOffline(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error("useOffline must be used within an OfflineProvider");
  }
  return context;
}

const QUEUE_KEY = "disaster_sos_queue";

interface OfflineProviderProps {
  children: ReactNode;
}

export function OfflineProvider({
  children,
}: OfflineProviderProps): React.ReactElement {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingReports, setPendingReports] = useState<QueuedReport[]>([]);

  // Load pending reports from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      if (stored) {
        setPendingReports(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load pending reports:", e);
    }
  }, []);

  // Save pending reports to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(pendingReports));
    } catch (e) {
      console.error("Failed to save pending reports:", e);
    }
  }, [pendingReports]);

  // Remove a report from the queue
  const removeFromQueue = useCallback((localId: string) => {
    setPendingReports((prev) => prev.filter((r) => r.localId !== localId));
  }, []);

  // Sync pending reports when back online
  const syncPendingReports = useCallback(async () => {
    if (!navigator.onLine || pendingReports.length === 0) return;

    console.log(`Syncing ${pendingReports.length} pending reports...`);

    for (const report of pendingReports) {
      try {
        const formData = new FormData();
        formData.append("lat", report.lat.toString());
        formData.append("lng", report.lng.toString());
        formData.append("message", report.message || "Need help!");
        formData.append("severity", report.severity || "high");
        if (report.isMedical) formData.append("isMedical", "true");
        if (report.isFragile) formData.append("isFragile", "true");
        if (report.peopleCount)
          formData.append("peopleCount", report.peopleCount.toString());

        const response = await fetch("/api/reports", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          removeFromQueue(report.localId);
          console.log(`Synced report: ${report.localId}`);
        }
      } catch (error) {
        console.error(`Failed to sync report ${report.localId}:`, error);
      }
    }
  }, [pendingReports, removeFromQueue]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Try to sync pending reports
      syncPendingReports();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPendingReports]);

  // Add a report to the queue
  const queueReport = useCallback(
    (reportData: Omit<QueuedReport, "queuedAt" | "localId">): QueuedReport => {
      const queuedReport: QueuedReport = {
        ...reportData,
        queuedAt: Date.now(),
        localId: `local_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
      };
      setPendingReports((prev) => [...prev, queuedReport]);
      return queuedReport;
    },
    []
  );

  // Retry syncing periodically when online
  useEffect(() => {
    if (!isOnline || pendingReports.length === 0) return;

    const interval = setInterval(syncPendingReports, 30000); // Every 30 seconds
    syncPendingReports(); // Try immediately

    return () => clearInterval(interval);
  }, [isOnline, pendingReports.length, syncPendingReports]);

  const value: OfflineContextValue = {
    isOnline,
    pendingReports,
    queueReport,
    removeFromQueue,
    syncPendingReports,
    pendingCount: pendingReports.length,
  };

  return (
    <OfflineContext.Provider value={value}>
      {!isOnline && (
        <div className="offline-banner">
          ⚠️ You're offline. Reports will be sent when connection is restored.
        </div>
      )}
      {children}
    </OfflineContext.Provider>
  );
}

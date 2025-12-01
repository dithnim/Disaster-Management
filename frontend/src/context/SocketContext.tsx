import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
  useRef,
} from "react";
import { io, Socket } from "socket.io-client";
import type { Report, Rescuer, SocketContextValue } from "../types";
import { config, endpoints } from "../config";

const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}

interface SocketProviderProps {
  children: ReactNode;
}

// Use polling interval from config
const POLL_INTERVAL = config.pollInterval;

export function SocketProvider({
  children,
}: SocketProviderProps): React.ReactElement {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch reports via REST API
  const fetchReports = useCallback(async () => {
    try {
      const response = await fetch(endpoints.reports);
      if (response.ok) {
        const data = await response.json();
        setReports(data);
      }
    } catch (error) {
      console.error("Failed to fetch reports:", error);
    }
  }, []);

  // Start polling when not connected
  useEffect(() => {
    // Always fetch reports initially
    fetchReports();

    // If not connected via WebSocket, poll for updates
    if (!connected) {
      pollIntervalRef.current = setInterval(fetchReports, POLL_INTERVAL);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [connected, fetchReports]);

  useEffect(() => {
    // Try to connect to Socket.IO server (works locally)
    const socketInstance = io(window.location.origin, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    socketInstance.on("connect", () => {
      console.log("Socket connected");
      setConnected(true);
      // Stop polling when connected
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    });

    socketInstance.on("disconnect", () => {
      console.log("Socket disconnected");
      setConnected(false);
    });

    socketInstance.on("connect_error", (error) => {
      console.log("Socket connection error:", error.message);
      // Silently fail - we'll use REST polling instead
    });

    // Handle incoming reports
    socketInstance.on("reports:sync", (data: Report[]) => {
      setReports(data);
    });

    socketInstance.on("report:new", (report: Report) => {
      setReports((prev) => [report, ...prev.filter((r) => r.id !== report.id)]);
    });

    socketInstance.on("report:update", (updatedReport: Report) => {
      setReports((prev) =>
        prev.map((r) => (r.id === updatedReport.id ? updatedReport : r))
      );
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const joinAsRescuer = useCallback(
    (rescuerInfo: Rescuer) => {
      if (socket && connected) {
        socket.emit("rescuer:join", rescuerInfo);
      }
      // Send heartbeat to mark rescuer as active (don't re-register)
      fetch(`${config.apiUrl}/api/rescuers/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rescuerInfo.id }),
      }).catch((err) => console.error("Rescuer heartbeat failed:", err));
    },
    [socket, connected]
  );

  const trackReport = useCallback(
    (shortCode: string) => {
      if (socket && connected) {
        socket.emit("user:track", shortCode);
      }
    },
    [socket, connected]
  );

  const updateLocation = useCallback(
    (rescuerId: string, lat: number, lng: number) => {
      if (socket && connected) {
        socket.emit("rescuer:location", { rescuerId, lat, lng });
      }
    },
    [socket, connected]
  );

  const value: SocketContextValue = {
    socket: socket as unknown as SocketContextValue["socket"],
    connected,
    reports,
    setReports,
    joinAsRescuer,
    trackReport,
    updateLocation,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Report, Rescuer, SocketContextValue } from '../types';

const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps): React.ReactElement {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    // Connect to Socket.IO server
    const socketInstance = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected');
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
    });

    // Handle incoming reports
    socketInstance.on('reports:sync', (data: Report[]) => {
      setReports(data);
    });

    socketInstance.on('report:new', (report: Report) => {
      setReports(prev => [report, ...prev.filter(r => r.id !== report.id)]);
    });

    socketInstance.on('report:update', (updatedReport: Report) => {
      setReports(prev => prev.map(r => r.id === updatedReport.id ? updatedReport : r));
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const joinAsRescuer = useCallback((rescuerInfo: Rescuer) => {
    if (socket) {
      socket.emit('rescuer:join', rescuerInfo);
    }
  }, [socket]);

  const trackReport = useCallback((shortCode: string) => {
    if (socket) {
      socket.emit('user:track', shortCode);
    }
  }, [socket]);

  const updateLocation = useCallback((rescuerId: string, lat: number, lng: number) => {
    if (socket) {
      socket.emit('rescuer:location', { rescuerId, lat, lng });
    }
  }, [socket]);

  const value: SocketContextValue = {
    socket: socket as unknown as SocketContextValue['socket'],
    connected,
    reports,
    setReports,
    joinAsRescuer,
    trackReport,
    updateLocation
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

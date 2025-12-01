import React, { useState, useEffect } from "react";
import {
  BarChart2,
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  Activity,
} from "lucide-react";
import type { StatsResponse } from "../types";
import { endpoints } from "../config";

interface StatusCard {
  label: string;
  value: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

interface SeverityData {
  label: string;
  value: number;
  color: string;
}

interface PipelineItem {
  label: string;
  value?: number;
  color?: string;
  isArrow?: boolean;
}

const StatsPage: React.FC = () => {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async (): Promise<void> => {
    try {
      const response = await fetch(endpoints.stats);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <p className="text-gray-400">Failed to load statistics</p>
      </div>
    );
  }

  const statusCards: StatusCard[] = [
    {
      label: "New",
      value: stats.byStatus.new,
      color: "bg-red-600",
      icon: AlertTriangle,
      description: "Awaiting response",
    },
    {
      label: "Claimed",
      value: stats.byStatus.claimed,
      color: "bg-yellow-600",
      icon: Users,
      description: "Rescuer assigned",
    },
    {
      label: "En Route",
      value: stats.byStatus.enRoute,
      color: "bg-blue-600",
      icon: Activity,
      description: "Help on the way",
    },
    {
      label: "Rescued",
      value: stats.byStatus.rescued + stats.byStatus.closed,
      color: "bg-green-600",
      icon: CheckCircle,
      description: "Successfully rescued",
    },
  ];

  const severityData: SeverityData[] = [
    {
      label: "Critical",
      value: stats.bySeverity.critical,
      color: "bg-red-900",
    },
    { label: "High", value: stats.bySeverity.high, color: "bg-red-600" },
    { label: "Medium", value: stats.bySeverity.medium, color: "bg-yellow-600" },
    { label: "Low", value: stats.bySeverity.low, color: "bg-green-600" },
  ];

  const totalSeverity =
    Object.values(stats.bySeverity).reduce((a, b) => a + b, 0) || 1;

  const pipelineItems: PipelineItem[] = [
    { label: "New", value: stats.byStatus.new, color: "bg-red-600" },
    { label: "→", isArrow: true },
    { label: "Claimed", value: stats.byStatus.claimed, color: "bg-yellow-600" },
    { label: "→", isArrow: true },
    { label: "En Route", value: stats.byStatus.enRoute, color: "bg-blue-600" },
    { label: "→", isArrow: true },
    { label: "Arrived", value: stats.byStatus.arrived, color: "bg-purple-600" },
    { label: "→", isArrow: true },
    { label: "Rescued", value: stats.byStatus.rescued, color: "bg-green-600" },
    { label: "→", isArrow: true },
    { label: "Closed", value: stats.byStatus.closed, color: "bg-gray-600" },
  ];

  return (
    <div className="min-h-full bg-gray-900 p-4 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="w-7 h-7 text-purple-500" />
              Analytics Dashboard
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Real-time disaster response statistics
            </p>
          </div>
          <button
            onClick={fetchStats}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statusCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`w-10 h-10 ${card.color} rounded-lg flex items-center justify-center`}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-3xl font-bold">{card.value}</span>
                </div>
                <p className="font-medium">{card.label}</p>
                <p className="text-xs text-gray-500">{card.description}</p>
              </div>
            );
          })}
        </div>

        {/* Main Stats Grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Overview Card */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              Overview
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <p className="text-4xl font-bold text-white">{stats.total}</p>
                <p className="text-gray-400 text-sm">Total Reports</p>
              </div>

              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <p className="text-4xl font-bold text-green-400">
                  {stats.activeRescuers}
                </p>
                <p className="text-gray-400 text-sm">Active Rescuers</p>
              </div>

              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <p className="text-4xl font-bold text-blue-400">
                  {stats.connectedClients}
                </p>
                <p className="text-gray-400 text-sm">Connected Users</p>
              </div>

              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <p className="text-4xl font-bold text-yellow-400">
                  {stats.total > 0
                    ? Math.round(
                        ((stats.byStatus.rescued + stats.byStatus.closed) /
                          stats.total) *
                          100
                      )
                    : 0}
                  %
                </p>
                <p className="text-gray-400 text-sm">Success Rate</p>
              </div>
            </div>
          </div>

          {/* Severity Breakdown */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Severity Breakdown
            </h2>

            <div className="space-y-4">
              {severityData.map((item) => {
                const percentage = (item.value / totalSeverity) * 100;
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{item.label}</span>
                      <span className="text-gray-400">
                        {item.value} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status Pipeline */}
          <div className="bg-gray-800 rounded-xl p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-400" />
              Rescue Pipeline
            </h2>

            <div className="flex flex-wrap gap-2 items-center justify-center">
              {pipelineItems.map((item, index) =>
                item.isArrow ? (
                  <span key={index} className="text-gray-500 text-2xl px-2">
                    →
                  </span>
                ) : (
                  <div
                    key={index}
                    className={`${item.color} px-4 py-3 rounded-lg text-center min-w-[80px]`}
                  >
                    <p className="text-2xl font-bold">{item.value}</p>
                    <p className="text-xs opacity-80">{item.label}</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Last Updated */}
        <div className="text-center mt-8 text-gray-500 text-sm flex items-center justify-center gap-2">
          <Clock className="w-4 h-4" />
          Last updated: {new Date(stats.lastUpdate).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default StatsPage;

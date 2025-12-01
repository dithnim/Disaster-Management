import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Clock,
  MapPin,
  User,
  CheckCircle,
  Truck,
  Radio,
  ArrowLeft,
  RefreshCw,
  Share2,
  Copy,
} from "lucide-react";
import type { Report, Status, StatusInfo, ProgressStep } from "../types";
import { config } from "../config";

const TrackPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const { socket, trackReport } = useSocket();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code) return;

    fetchReport();
    trackReport(code);

    // Listen for updates
    if (socket) {
      const handleStatus = (data: Report) => {
        if (data.shortCode === code.toUpperCase()) {
          setReport(data);
        }
      };

      const handleUpdate = (data: Report) => {
        if (data.shortCode === code.toUpperCase()) {
          setReport(data);
        }
      };

      socket.on("report:status", handleStatus);
      socket.on("report:update", handleUpdate);

      return () => {
        socket.off("report:status", handleStatus);
        socket.off("report:update", handleUpdate);
      };
    }
  }, [code, socket, trackReport]);

  const fetchReport = async (): Promise<void> => {
    if (!code) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${config.apiUrl}/api/reports/${code}`);
      if (response.ok) {
        const data = await response.json();
        setReport(data);
      } else {
        setError("Report not found");
      }
    } catch {
      setError("Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = (): void => {
    if (!code) return;
    navigator.clipboard.writeText(code.toUpperCase());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareReport = (): void => {
    if (!code) return;
    if (navigator.share) {
      navigator.share({
        title: "Track My Rescue",
        text: `Track my rescue status. Code: ${code.toUpperCase()}`,
        url: window.location.href,
      });
    } else {
      copyCode();
    }
  };

  const getStatusInfo = (status: Status): StatusInfo => {
    const infoMap: Record<Status, StatusInfo> = {
      new: {
        color: "bg-red-500",
        bgColor: "bg-red-900/30",
        borderColor: "border-red-700",
        label: "Waiting for Rescuer",
        description:
          "Your distress signal has been received. A rescuer will respond shortly.",
        icon: Radio,
        step: 1,
      },
      claimed: {
        color: "bg-yellow-500",
        bgColor: "bg-yellow-900/30",
        borderColor: "border-yellow-700",
        label: "Rescuer Assigned",
        description:
          "A rescuer has claimed your case and is preparing to help.",
        icon: User,
        step: 2,
      },
      en_route: {
        color: "bg-blue-500",
        bgColor: "bg-blue-900/30",
        borderColor: "border-blue-700",
        label: "Help is Coming",
        description: "A rescuer is on the way to your location.",
        icon: Truck,
        step: 3,
      },
      arrived: {
        color: "bg-purple-500",
        bgColor: "bg-purple-900/30",
        borderColor: "border-purple-700",
        label: "Rescuer Arrived",
        description: "The rescuer has arrived at your location.",
        icon: MapPin,
        step: 4,
      },
      rescued: {
        color: "bg-green-500",
        bgColor: "bg-green-900/30",
        borderColor: "border-green-700",
        label: "Rescued!",
        description: "You have been rescued. Stay safe!",
        icon: CheckCircle,
        step: 5,
      },
      closed: {
        color: "bg-gray-500",
        bgColor: "bg-gray-900/30",
        borderColor: "border-gray-700",
        label: "Case Closed",
        description: "This rescue case has been closed.",
        icon: CheckCircle,
        step: 6,
      },
    };
    return infoMap[status] || infoMap.new;
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading report status...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 p-4">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">
            Report Not Found
          </h2>
          <p className="text-gray-400 mb-6">
            We couldn't find a report with code "{code?.toUpperCase()}". Please
            check the code and try again.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Link>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(report.status);
  const StatusIcon = statusInfo.icon;

  const progressSteps: ProgressStep[] = [
    { step: 1, label: "Report Received", status: "new" },
    { step: 2, label: "Rescuer Assigned", status: "claimed" },
    { step: 3, label: "En Route", status: "en_route" },
    { step: 4, label: "Arrived", status: "arrived" },
    { step: 5, label: "Rescued", status: "rescued" },
  ];

  return (
    <div className="min-h-full bg-gray-900 p-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </Link>
          <button
            onClick={shareReport}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition"
          >
            <Share2 className="w-5 h-5" />
            Share
          </button>
        </div>

        {/* Tracking Code */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6 text-center">
          <p className="text-sm text-gray-400 mb-2">Tracking Code</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-4xl font-mono font-bold tracking-wider">
              {report.shortCode}
            </span>
            <button
              onClick={copyCode}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
              title="Copy code"
            >
              <Copy className="w-5 h-5" />
            </button>
          </div>
          {copied && (
            <p className="text-green-400 text-sm mt-2">Copied to clipboard!</p>
          )}
        </div>

        {/* Status Card */}
        <div
          className={`${statusInfo.bgColor} border ${statusInfo.borderColor} rounded-xl p-6 mb-6`}
        >
          <div className="flex items-center gap-4 mb-4">
            <div
              className={`w-16 h-16 rounded-full ${statusInfo.color} flex items-center justify-center`}
            >
              <StatusIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                {statusInfo.label}
              </h2>
              <p className="text-gray-400">{statusInfo.description}</p>
            </div>
          </div>

          {report.claimedByName && (
            <div className="flex items-center gap-2 text-gray-300 mt-4 pt-4 border-t border-gray-700">
              <User className="w-5 h-5" />
              <span>
                Rescuer: <strong>{report.claimedByName}</strong>
              </span>
            </div>
          )}

          {report.eta && (
            <div className="flex items-center gap-2 text-gray-300 mt-2">
              <Clock className="w-5 h-5" />
              <span>ETA: {report.eta}</span>
            </div>
          )}
        </div>

        {/* Progress Steps */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <h3 className="font-medium text-gray-300 mb-4">Rescue Progress</h3>
          <div className="space-y-4">
            {progressSteps.map((item) => {
              const isComplete =
                statusInfo.step > item.step ||
                (statusInfo.step === item.step && report.status === "rescued");
              const isCurrent =
                statusInfo.step === item.step && report.status !== "rescued";

              return (
                <div key={item.step} className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                    ${
                      isComplete
                        ? "bg-green-600 text-white"
                        : isCurrent
                        ? "bg-blue-600 text-white animate-pulse"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      item.step
                    )}
                  </div>
                  <span
                    className={`${
                      isComplete || isCurrent ? "text-white" : "text-gray-500"
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Report Details */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h3 className="font-medium text-gray-300 mb-4">Report Details</h3>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Message</span>
              <span className="text-gray-300">{report.message}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Severity</span>
              <span
                className={`px-2 py-0.5 rounded text-xs uppercase ${
                  report.severity === "critical"
                    ? "bg-red-900 text-red-200"
                    : report.severity === "high"
                    ? "bg-red-700 text-red-100"
                    : report.severity === "medium"
                    ? "bg-yellow-600 text-yellow-100"
                    : "bg-green-600 text-green-100"
                }`}
              >
                {report.severity}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Location</span>
              <span className="text-gray-300 text-right">
                {report.lat.toFixed(6)}, {report.lng.toFixed(6)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Reported</span>
              <span className="text-gray-300">
                {formatDistanceToNow(report.timestamp, { addSuffix: true })}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Last Update</span>
              <span className="text-gray-300">
                {formatDistanceToNow(report.lastUpdate, { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={fetchReport}
          className="w-full mt-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center justify-center gap-2 transition"
        >
          <RefreshCw className="w-5 h-5" />
          Refresh Status
        </button>
      </div>
    </div>
  );
};

export default TrackPage;

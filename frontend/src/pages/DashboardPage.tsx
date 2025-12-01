import React, { useState, useEffect, FormEvent } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useSocket } from "../context/SocketContext";
import { formatDistanceToNow } from "date-fns";
import {
  Clock,
  MapPin,
  Heart,
  Users,
  CheckCircle,
  Truck,
  Flag,
  X,
  Radio,
} from "lucide-react";
import type {
  Report,
  Rescuer,
  DashboardFilter,
  Severity,
  Status,
} from "../types";
import { config } from "../config";

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Custom marker icons by severity
const createMarkerIcon = (severity: Severity, status: Status): L.DivIcon => {
  const colors: Record<Severity, string> = {
    critical: "#7f1d1d",
    high: "#dc2626",
    medium: "#f59e0b",
    low: "#22c55e",
  };

  const statusOpacity = status === "new" ? 1 : 0.6;

  return L.divIcon({
    className: "custom-marker",
    html: `
      <div style="
        width: 30px;
        height: 30px;
        background: ${colors[severity] || colors.high};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        opacity: ${statusOpacity};
      ">
        <div style="
          width: 10px;
          height: 10px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 7px;
          left: 7px;
        "></div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  });
};

// Map center controller component
interface MapControllerProps {
  center: [number, number];
}

function MapController({ center }: MapControllerProps): null {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

// Rescuer info storage
const RESCUER_KEY = "disaster_rescuer_info";

const DashboardPage: React.FC = () => {
  const { connected, reports, joinAsRescuer } = useSocket();
  const [rescuerInfo, setRescuerInfo] = useState<Rescuer | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<DashboardFilter>({
    status: "",
    severity: "",
  });
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    7.8731, 80.7718,
  ]); // Sri Lanka center

  // Registration form
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");

  // Load rescuer info on mount
  useEffect(() => {
    const stored = localStorage.getItem(RESCUER_KEY);
    if (stored) {
      const info = JSON.parse(stored) as Rescuer;
      setRescuerInfo(info);
      joinAsRescuer(info);
    } else {
      setShowRegister(true);
    }
  }, [joinAsRescuer]);

  const handleRegister = async (e: FormEvent): Promise<void> => {
    e.preventDefault();

    try {
      const response = await fetch(`${config.apiUrl}/api/rescuers/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, organization }),
      });

      const data = await response.json();

      if (data.ok) {
        const info = data.rescuer as Rescuer;
        localStorage.setItem(RESCUER_KEY, JSON.stringify(info));
        setRescuerInfo(info);
        joinAsRescuer(info);
        setShowRegister(false);
      }
    } catch (error) {
      console.error("Registration error:", error);
    }
  };

  const claimReport = async (reportId: string): Promise<void> => {
    if (!rescuerInfo) return;

    try {
      const response = await fetch(
        `${config.apiUrl}/api/reports/${reportId}/claim`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rescuerId: rescuerInfo.id,
            rescuerName: rescuerInfo.name,
          }),
        }
      );

      if (response.ok) {
        // Report will be updated via WebSocket
        setSelectedReport(null);
      }
    } catch (error) {
      console.error("Claim error:", error);
    }
  };

  const updateStatus = async (
    reportId: string,
    status: Status
  ): Promise<void> => {
    try {
      await fetch(`${config.apiUrl}/api/reports/${reportId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch (error) {
      console.error("Status update error:", error);
    }
  };

  const releaseReport = async (reportId: string): Promise<void> => {
    try {
      await fetch(`${config.apiUrl}/api/reports/${reportId}/release`, {
        method: "POST",
      });
      setSelectedReport(null);
    } catch (error) {
      console.error("Release error:", error);
    }
  };

  // Filter reports
  const filteredReports = reports.filter((r) => {
    if (filter.status && r.status !== filter.status) return false;
    if (filter.severity && r.severity !== filter.severity) return false;
    return true;
  });

  const focusOnReport = (report: Report): void => {
    setSelectedReport(report);
    setMapCenter([report.lat, report.lng]);
  };

  const getSeverityColor = (severity: Severity): string => {
    const colors: Record<Severity, string> = {
      critical: "bg-red-900 text-red-200",
      high: "bg-red-700 text-red-100",
      medium: "bg-yellow-600 text-yellow-100",
      low: "bg-green-600 text-green-100",
    };
    return colors[severity] || colors.high;
  };

  const getStatusColor = (status: Status): string => {
    const colors: Record<Status, string> = {
      new: "bg-red-500",
      claimed: "bg-yellow-500",
      en_route: "bg-blue-500",
      arrived: "bg-purple-500",
      rescued: "bg-green-500",
      closed: "bg-gray-500",
    };
    return colors[status] || colors.new;
  };

  const getStatusLabel = (status: Status): string => {
    const labels: Record<Status, string> = {
      new: "New",
      claimed: "Claimed",
      en_route: "En Route",
      arrived: "Arrived",
      rescued: "Rescued",
      closed: "Closed",
    };
    return labels[status] || status;
  };

  // Registration Modal
  if (showRegister) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full">
          <h2 className="text-2xl font-bold text-white mb-2">
            Rescuer Registration
          </h2>
          <p className="text-gray-400 mb-6">
            Register to access the rescue dashboard and respond to distress
            calls.
          </p>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Organization (optional)
              </label>
              <input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Red Cross, Fire Dept"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition"
            >
              Register as Rescuer
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Sidebar */}
      <div className="w-full lg:w-96 bg-gray-800 flex flex-col max-h-[40vh] lg:max-h-full overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-bold text-lg">Rescue Dashboard</h2>
              <p className="text-xs text-gray-400">
                {rescuerInfo?.name} •{" "}
                {rescuerInfo?.organization || "Independent"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? "bg-green-500" : "bg-red-500"
                }`}
              ></span>
              <span className="text-xs text-gray-400">
                {connected ? "Live" : "Disconnected"}
              </span>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <select
              value={filter.status}
              onChange={(e) =>
                setFilter({ ...filter, status: e.target.value as Status | "" })
              }
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
            >
              <option value="">All Status</option>
              <option value="new">New</option>
              <option value="claimed">Claimed</option>
              <option value="en_route">En Route</option>
              <option value="arrived">Arrived</option>
              <option value="rescued">Rescued</option>
            </select>

            <select
              value={filter.severity}
              onChange={(e) =>
                setFilter({
                  ...filter,
                  severity: e.target.value as Severity | "",
                })
              }
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
            >
              <option value="">All Severity</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Reports List */}
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          {filteredReports.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Radio className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active reports</p>
              <p className="text-xs mt-1">Waiting for distress signals...</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {filteredReports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => focusOnReport(report)}
                  className={`w-full p-3 text-left hover:bg-gray-700 transition ${
                    selectedReport?.id === report.id ? "bg-gray-700" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${getSeverityColor(
                          report.severity
                        )}`}
                      >
                        {report.severity.toUpperCase()}
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full ${getStatusColor(
                          report.status
                        )}`}
                      ></span>
                    </div>
                    <span className="text-xs text-gray-500 font-mono">
                      {report.shortCode}
                    </span>
                  </div>

                  <p className="text-sm text-gray-300 truncate mb-1">
                    {report.message}
                  </p>

                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(report.timestamp, {
                        addSuffix: true,
                      })}
                    </span>
                    {report.isMedical && (
                      <span className="flex items-center gap-1 text-red-400">
                        <Heart className="w-3 h-3" /> Medical
                      </span>
                    )}
                    {report.peopleCount && report.peopleCount > 1 && (
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {report.peopleCount}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={mapCenter}
          zoom={8}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController center={mapCenter} />

          {filteredReports.map((report) => (
            <Marker
              key={report.id}
              position={[report.lat, report.lng]}
              icon={createMarkerIcon(report.severity, report.status)}
              eventHandlers={{
                click: () => setSelectedReport(report),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <strong>{report.shortCode}</strong>
                  <p>{report.message}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Selected Report Detail Panel */}
        {selectedReport && (
          <div className="absolute bottom-0 left-0 right-0 lg:right-auto lg:w-96 bg-gray-800 border-t lg:border-r border-gray-700 p-4 shadow-2xl">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-bold text-lg">
                    {selectedReport.shortCode}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${getSeverityColor(
                      selectedReport.severity
                    )}`}
                  >
                    {selectedReport.severity.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-gray-400">
                  {formatDistanceToNow(selectedReport.timestamp, {
                    addSuffix: true,
                  })}
                </p>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-300 mb-3">{selectedReport.message}</p>

            <div className="flex flex-wrap gap-2 mb-4">
              {selectedReport.isMedical && (
                <span className="flex items-center gap-1 text-xs bg-red-900 text-red-200 px-2 py-1 rounded">
                  <Heart className="w-3 h-3" /> Medical Emergency
                </span>
              )}
              {selectedReport.isFragile && (
                <span className="flex items-center gap-1 text-xs bg-yellow-900 text-yellow-200 px-2 py-1 rounded">
                  Elderly/Children
                </span>
              )}
              <span className="flex items-center gap-1 text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                <Users className="w-3 h-3" /> {selectedReport.peopleCount || 1}{" "}
                {(selectedReport.peopleCount || 1) > 1 ? "people" : "person"}
              </span>
            </div>

            <div className="text-xs text-gray-500 mb-4">
              <MapPin className="w-3 h-3 inline mr-1" />
              {selectedReport.lat.toFixed(6)}, {selectedReport.lng.toFixed(6)}
            </div>

            {selectedReport.photoUrl && (
              <img
                src={selectedReport.photoUrl}
                alt="Report photo"
                className="w-full h-32 object-cover rounded-lg mb-4"
              />
            )}

            {/* Status & Actions */}
            <div className="border-t border-gray-700 pt-3">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`w-3 h-3 rounded-full ${getStatusColor(
                    selectedReport.status
                  )}`}
                ></span>
                <span className="font-medium">
                  {getStatusLabel(selectedReport.status)}
                </span>
                {selectedReport.claimedByName && (
                  <span className="text-gray-400 text-sm">
                    by {selectedReport.claimedByName}
                  </span>
                )}
              </div>

              {selectedReport.status === "new" ? (
                <button
                  onClick={() => claimReport(selectedReport.id)}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition flex items-center justify-center gap-2"
                >
                  <Flag className="w-4 h-4" /> Claim This Rescue
                </button>
              ) : selectedReport.claimedBy === rescuerInfo?.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {selectedReport.status === "claimed" && (
                      <button
                        onClick={() =>
                          updateStatus(selectedReport.id, "en_route")
                        }
                        className="py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm flex items-center justify-center gap-1"
                      >
                        <Truck className="w-4 h-4" /> En Route
                      </button>
                    )}
                    {selectedReport.status === "en_route" && (
                      <button
                        onClick={() =>
                          updateStatus(selectedReport.id, "arrived")
                        }
                        className="py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm flex items-center justify-center gap-1"
                      >
                        <MapPin className="w-4 h-4" /> Arrived
                      </button>
                    )}
                    {selectedReport.status === "arrived" && (
                      <button
                        onClick={() =>
                          updateStatus(selectedReport.id, "rescued")
                        }
                        className="py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm flex items-center justify-center gap-1"
                      >
                        <CheckCircle className="w-4 h-4" /> Rescued
                      </button>
                    )}
                    {selectedReport.status !== "rescued" &&
                      selectedReport.status !== "closed" && (
                        <button
                          onClick={() => releaseReport(selectedReport.id)}
                          className="py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm"
                        >
                          Release
                        </button>
                      )}
                  </div>

                  {selectedReport.status === "rescued" && (
                    <button
                      onClick={() => updateStatus(selectedReport.id, "closed")}
                      className="w-full py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm"
                    >
                      Close Case
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-2">
                  This report is being handled by {selectedReport.claimedByName}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;

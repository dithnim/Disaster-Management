import React, { useState, useEffect, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Phone,
  MapPin,
  Users,
  Heart,
  Send,
  Loader2,
  Wifi,
  WifiOff,
  Camera,
  X,
  CheckCircle,
} from "lucide-react";
import { useOffline } from "../context/OfflineContext";
import type { Location, Severity, SOSSuccess, SeverityOption } from "../types";

// Battery API types
interface BatteryManager {
  level: number;
}

declare global {
  interface Navigator {
    getBattery?: () => Promise<BatteryManager>;
  }
}

const SEVERITY_OPTIONS: SeverityOption[] = [
  { value: "low", label: "Low", color: "bg-green-600" },
  { value: "medium", label: "Medium", color: "bg-yellow-600" },
  { value: "high", label: "High", color: "bg-orange-600" },
  { value: "critical", label: "Critical", color: "bg-red-600" },
];

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isOnline, queueReport, pendingCount } = useOffline();

  const [location, setLocation] = useState<Location | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<SOSSuccess | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<Severity>("high");
  const [isMedical, setIsMedical] = useState(false);
  const [isFragile, setIsFragile] = useState(false);
  const [peopleCount, setPeopleCount] = useState(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Get location on mount
  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = (): void => {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        console.error("Location error:", error);
        setLocationError("Unable to get your location. Please enable GPS.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = (): void => {
    setPhoto(null);
    setPhotoPreview(null);
  };

  const getBatteryLevel = async (): Promise<number | null> => {
    if (navigator.getBattery) {
      try {
        const battery = await navigator.getBattery();
        return Math.round(battery.level * 100);
      } catch {
        return null;
      }
    }
    return null;
  };

  const sendSOS = async (): Promise<void> => {
    if (!location) {
      getLocation();
      return;
    }

    setLoading(true);
    setSuccess(null);

    const batteryLevel = await getBatteryLevel();

    const reportData = {
      lat: location.lat,
      lng: location.lng,
      message: message || "Need help!",
      severity,
      isMedical,
      isFragile,
      peopleCount,
      batteryLevel: batteryLevel ?? undefined,
    };

    // If offline, queue the report
    if (!isOnline) {
      const queued = queueReport(reportData);
      setSuccess({
        queued: true,
        localId: queued.localId,
        message:
          "Your SOS has been queued and will be sent when you're back online.",
      });
      setLoading(false);
      setShowForm(false);
      return;
    }

    try {
      // If there's a photo, use FormData; otherwise use JSON
      let response: Response;
      
      if (photo) {
        const formData = new FormData();
        formData.append("lat", location.lat.toString());
        formData.append("lng", location.lng.toString());
        formData.append("message", message || "Need help!");
        formData.append("severity", severity);
        formData.append("isMedical", isMedical.toString());
        formData.append("isFragile", isFragile.toString());
        formData.append("peopleCount", peopleCount.toString());
        if (batteryLevel !== null) {
          formData.append("batteryLevel", batteryLevel.toString());
        }
        formData.append("photo", photo);

        response = await fetch("/api/reports", {
          method: "POST",
          body: formData,
        });
      } else {
        // Send as JSON when no photo
        response = await fetch("/api/reports", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lat: location.lat,
            lng: location.lng,
            message: message || "Need help!",
            severity,
            isMedical,
            isFragile,
            peopleCount,
            batteryLevel,
          }),
        });
      }

      const data = await response.json();

      if (response.ok) {
        setSuccess({
          queued: false,
          shortCode: data.shortCode,
          id: data.id,
          message: "SOS sent successfully! Help is on the way.",
        });
        setShowForm(false);
        // Reset form
        setMessage("");
        setSeverity("high");
        setIsMedical(false);
        setIsFragile(false);
        setPeopleCount(1);
        removePhoto();
      } else {
        throw new Error(data.error || "Failed to send SOS");
      }
    } catch (error) {
      console.error("SOS error:", error);
      // Queue for retry
      const queued = queueReport(reportData);
      setSuccess({
        queued: true,
        localId: queued.localId,
        message:
          "Network error. Your SOS has been queued and will retry automatically.",
      });
    } finally {
      setLoading(false);
    }
  };

  const quickSOS = async (): Promise<void> => {
    if (!location) {
      getLocation();
      alert("Getting your location... Please try again in a moment.");
      return;
    }
    setSeverity("high");
    setMessage("");
    await sendSOS();
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-gray-900 to-gray-800">
      {/* Status Bar */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="flex items-center gap-1 text-green-400">
              <Wifi className="w-4 h-4" /> Online
            </span>
          ) : (
            <span className="flex items-center gap-1 text-yellow-400">
              <WifiOff className="w-4 h-4" /> Offline
            </span>
          )}
          {pendingCount > 0 && (
            <span className="bg-yellow-600 text-white text-xs px-2 py-0.5 rounded-full">
              {pendingCount} pending
            </span>
          )}
        </div>

        {location && (
          <div className="flex items-center gap-1 text-gray-400">
            <MapPin className="w-4 h-4" />
            <span className="text-xs">
              {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
            </span>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {success ? (
          // Success State
          <div className="text-center space-y-6 max-w-md">
            <div className="w-24 h-24 mx-auto bg-green-600 rounded-full flex items-center justify-center">
              <CheckCircle className="w-14 h-14 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-green-400">
              {success.queued ? "SOS Queued" : "SOS Sent!"}
            </h2>
            <p className="text-gray-300">{success.message}</p>

            {success.shortCode && (
              <div className="bg-gray-800 p-4 rounded-lg">
                <p className="text-sm text-gray-400 mb-1">
                  Your tracking code:
                </p>
                <p className="text-3xl font-mono font-bold text-white tracking-wider">
                  {success.shortCode}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Share this code so others can track your rescue
                </p>
                <button
                  onClick={() => navigate(`/track/${success.shortCode}`)}
                  className="mt-4 text-blue-400 underline"
                >
                  Track your rescue →
                </button>
              </div>
            )}

            <button
              onClick={() => setSuccess(null)}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              Send Another SOS
            </button>
          </div>
        ) : showForm ? (
          // Detailed Form
          <div className="w-full max-w-md space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Send Distress Report</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Location Status */}
            {locationError ? (
              <div className="bg-red-900/50 border border-red-700 p-3 rounded-lg text-sm">
                <p className="text-red-400">{locationError}</p>
                <button
                  onClick={getLocation}
                  className="text-red-300 underline text-xs mt-1"
                >
                  Retry getting location
                </button>
              </div>
            ) : location ? (
              <div className="bg-green-900/30 border border-green-700 p-3 rounded-lg text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-green-400" />
                <span className="text-green-300">
                  Location captured: {location.lat.toFixed(4)},{" "}
                  {location.lng.toFixed(4)}
                </span>
              </div>
            ) : (
              <div className="bg-yellow-900/30 border border-yellow-700 p-3 rounded-lg text-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
                <span className="text-yellow-300">
                  Getting your location...
                </span>
              </div>
            )}

            {/* Severity */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Severity
              </label>
              <div className="grid grid-cols-4 gap-2">
                {SEVERITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSeverity(opt.value)}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition ${
                      severity === opt.value
                        ? `${opt.color} text-white ring-2 ring-white`
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Message (optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your situation..."
                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                rows={3}
              />
            </div>

            {/* Flags */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isMedical}
                  onChange={(e) => setIsMedical(e.target.checked)}
                  className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-red-600 focus:ring-red-500"
                />
                <span className="flex items-center gap-1 text-sm">
                  <Heart className="w-4 h-4 text-red-400" /> Medical Emergency
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFragile}
                  onChange={(e) => setIsFragile(e.target.checked)}
                  className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-yellow-600 focus:ring-yellow-500"
                />
                <span className="text-sm">Elderly/Children</span>
              </label>
            </div>

            {/* People Count */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <Users className="w-4 h-4 inline mr-1" /> Number of People
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPeopleCount(Math.max(1, peopleCount - 1))}
                  className="w-10 h-10 bg-gray-700 rounded-lg hover:bg-gray-600"
                >
                  -
                </button>
                <span className="text-2xl font-bold w-12 text-center">
                  {peopleCount}
                </span>
                <button
                  onClick={() => setPeopleCount(peopleCount + 1)}
                  className="w-10 h-10 bg-gray-700 rounded-lg hover:bg-gray-600"
                >
                  +
                </button>
              </div>
            </div>

            {/* Photo */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Photo (optional)
              </label>
              {photoPreview ? (
                <div className="relative inline-block">
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="w-32 h-32 object-cover rounded-lg"
                  />
                  <button
                    onClick={removePhoto}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 p-4 bg-gray-800 border border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700 transition">
                  <Camera className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-400">Add photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Submit Button */}
            <button
              onClick={sendSOS}
              disabled={loading || !location}
              className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-bold text-lg flex items-center justify-center gap-2 transition"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Distress Report
                </>
              )}
            </button>
          </div>
        ) : (
          // Main SOS Button
          <div className="text-center space-y-8">
            <h1 className="text-3xl font-bold text-white">Emergency SOS</h1>
            <p className="text-gray-400 max-w-xs mx-auto">
              Press the button below to send your location and request help
              immediately
            </p>

            {/* Big SOS Button */}
            <button
              onClick={quickSOS}
              disabled={loading}
              className="sos-button w-48 h-48 rounded-full bg-red-600 hover:bg-red-700 flex flex-col items-center justify-center text-white font-bold text-2xl shadow-2xl shadow-red-900/50 transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-16 h-16 animate-spin" />
              ) : (
                <>
                  <AlertTriangle className="w-16 h-16 mb-2" />
                  <span>SOS</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowForm(true)}
              className="text-gray-400 hover:text-white underline text-sm"
            >
              Add more details →
            </button>

            {/* SMS Fallback Info */}
            <div className="mt-8 p-4 bg-gray-800/50 rounded-lg max-w-xs mx-auto">
              <p className="text-sm text-gray-400 flex items-center gap-2 justify-center">
                <Phone className="w-4 h-4" />
                No internet? Send SMS:
              </p>
              <p className="text-xs text-gray-500 mt-1 font-mono">
                SOS 6.9271,79.8612 Your message
              </p>
              <p className="text-xs text-gray-600 mt-1">to emergency hotline</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;

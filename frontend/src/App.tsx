import React from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { AlertTriangle, Map, BarChart2 } from "lucide-react";

// Pages
import HomePage from "./pages/HomePage.tsx";
import DashboardPage from "./pages/DashboardPage.tsx";
import TrackPage from "./pages/TrackPage.tsx";
import StatsPage from "./pages/StatsPage.tsx";

// Context
import { SocketProvider } from "./context/SocketContext.tsx";
import { OfflineProvider } from "./context/OfflineContext.tsx";

const App: React.FC = () => {
  const location = useLocation();

  return (
    <OfflineProvider>
      <SocketProvider>
        <div className="min-h-screen bg-gray-900 text-white">
          {/* Navigation */}
          <nav className="bg-gray-800 border-b border-gray-700">
            <div className="max-w-7xl mx-auto px-4">
              <div className="flex items-center justify-between h-14">
                <Link
                  to="/"
                  className="flex items-center gap-2 text-red-500 font-bold text-lg"
                >
                  <AlertTriangle className="w-6 h-6" />
                  <span className="hidden sm:inline">DisasterSOS</span>
                </Link>

                <div className="flex items-center gap-1">
                  <Link
                    to="/"
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      location.pathname === "/"
                        ? "bg-red-600 text-white"
                        : "text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="hidden sm:inline">SOS</span>
                    </span>
                  </Link>

                  <Link
                    to="/dashboard"
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      location.pathname === "/dashboard"
                        ? "bg-blue-600 text-white"
                        : "text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <Map className="w-4 h-4" />
                      <span className="hidden sm:inline">Dashboard</span>
                    </span>
                  </Link>

                  <Link
                    to="/stats"
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      location.pathname === "/stats"
                        ? "bg-purple-600 text-white"
                        : "text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <BarChart2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Stats</span>
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="h-[calc(100vh-56px)]">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/track/:code" element={<TrackPage />} />
              <Route path="/stats" element={<StatsPage />} />
            </Routes>
          </main>
        </div>
      </SocketProvider>
    </OfflineProvider>
  );
};

export default App;

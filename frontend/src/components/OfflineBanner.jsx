import React, { useState, useEffect } from "react";

/**
 * OfflineBanner — shows a subtle, animated banner when the user loses internet.
 * It also listens for the "online" event and auto-flushes any queued complaints.
 */
const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [syncMessage, setSyncMessage] = useState(null);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = async () => {
      setIsOffline(false);

      // Try to flush the offline queue
      try {
        const { flushQueue } = await import("../services/offlineQueue.js");
        const synced = await flushQueue();
        if (synced > 0) {
          setSyncMessage(`✅ ${synced} offline complaint${synced > 1 ? "s" : ""} synced successfully!`);
          setTimeout(() => setSyncMessage(null), 5000);
        }
      } catch (err) {
        console.warn("[OfflineBanner] flush failed:", err);
      }
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return (
    <>
      {/* Offline Banner */}
      {isOffline && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)",
            color: "#fff",
            textAlign: "center",
            padding: "10px 16px",
            fontSize: "14px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
            animation: "slideDown 0.3s ease-out",
          }}
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"></path>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            <line x1="12" y1="20" x2="12.01" y2="20"></line>
          </svg>
          You are offline — Complaints will be saved locally and submitted automatically when you reconnect.
        </div>
      )}

      {/* Sync Success Toast */}
      {syncMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            background: "linear-gradient(135deg, #28a745 0%, #20c997 100%)",
            color: "#fff",
            padding: "14px 24px",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: 600,
            boxShadow: "0 4px 20px rgba(40,167,69,0.3)",
            animation: "slideUp 0.3s ease-out",
          }}
        >
          {syncMessage}
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
};

export default OfflineBanner;

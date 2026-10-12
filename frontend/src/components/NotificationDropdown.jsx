import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { useAuth } from '../context/AuthProvider';

import "./NotificationDropdown.css";
/**
 * NotificationDropdown — Bell icon with unread count badge and dropdown list.
 * Polls for new notifications every 30 seconds.
 */
const NotificationDropdown = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const getTicketId = (notif) => {
    if (notif.ticket_id) return notif.ticket_id;
    if (!notif.message) return null;
    const uuidMatch = notif.message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) return uuidMatch[0];
    const grMatch = notif.message.match(/GR-([0-9a-fA-F]{6,12})/i);
    if (grMatch) return grMatch[1];
    return null;
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      handleMarkRead(notif.notification_id);
    }
    setIsOpen(false);
    const ticketId = getTicketId(notif);
    if (ticketId) {
      navigate(`/track?id=${encodeURIComponent(ticketId)}`, {
        state: { trackingId: ticketId }
      });
    } else {
      navigate('/track');
    }
  };

  const fetchUnreadCount = async () => {
    if (!user) return;
    try {
      const res = await apiClient('/api/notifications/unread-count');
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unread_count || 0);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  };

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await apiClient('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  // Poll for unread count every 30 seconds
  useEffect(() => {
    if (!user) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // When dropdown opens, fetch full notification list
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkRead = async (notificationId) => {
    try {
      await apiClient(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
      setNotifications(prev =>
        prev.map(n => n.notification_id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient('/api/notifications/read-all', { method: 'PATCH' });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'GRIEVANCE_RECEIVED':
        return (
          <svg className="notif-type-icon" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        );
      case 'GRIEVANCE_ROUTED':
        return (
          <svg className="notif-type-icon" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 3 21 3 21 8" />
            <line x1="4" y1="20" x2="21" y2="3" />
            <polyline points="21 16 21 21 16 21" />
            <line x1="15" y1="15" x2="21" y2="21" />
            <line x1="4" y1="4" x2="9" y2="9" />
          </svg>
        );
      case 'CHATBOT_HANDOFF':
        return (
          <svg className="notif-type-icon" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        );
      case 'TIER_ASSIGNED':
        return (
          <svg className="notif-type-icon" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        );
      case 'SLA_BREACHED':
        return (
          <svg className="notif-type-icon" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        );
      case 'ESCALATED':
        return (
          <svg className="notif-type-icon" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 11 12 6 7 11" />
            <polyline points="17 18 12 13 7 18" />
          </svg>
        );
      case 'RESOLVED':
        return (
          <svg className="notif-type-icon" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        );
      case 'REOPENED':
        return (
          <svg className="notif-type-icon" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        );
      case 'STATUS_UPDATED':
        return (
          <svg className="notif-type-icon" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        );
      default:
        return (
          <svg className="notif-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        );
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!user) return null;

  return (
    <div className="position-relative" ref={dropdownRef}>
      {/* Bell Icon */}
      <button
        className={`cursor-pointer position-relative d-flex align-items-center justify-content-center text-theme notif-bell${isOpen ? " is-open" : ""}`}
        id="notification-bell"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="View notifications"
        title="Notifications"
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="position-absolute text-white d-flex align-items-center justify-content-center fs-10 fw-bold notif-count">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="position-absolute overflow-y-auto notif-panel">
          {/* Header */}
          <div className="d-flex justify-content-between align-items-center notif-header">
            <h6 className="m-0 fw-bold text-theme notif-title">
              Notifications
              {unreadCount > 0 && (
                <span className="ms-2 text-white fs-11 fw-semibold notif-title-count">
                  {unreadCount}
                </span>
              )}
            </h6>
            {unreadCount > 0 && (
              <button
                className="border-0 text-theme-muted fs-12 cursor-pointer fw-semibold notif-mark-read"
                onClick={handleMarkAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          {loading ? (
            <div className="text-center text-theme-muted notif-loading">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center notif-empty">
              <div className="rounded-circle d-flex align-items-center justify-content-center notif-empty-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <p className="text-theme-muted m-0 fs-14 fw-medium">No notifications yet</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                className={`cursor-pointer d-flex align-items-start notif-item${notif.is_read ? "" : " is-unread"}`}
                key={notif.notification_id}
                onClick={() => handleNotificationClick(notif)}
              >
                {/* Icon */}
                <span className="flex-shrink-0 notif-item-icon">
                  {getNotificationIcon(notif.type)}
                </span>

                {/* Content */}
                <div className="notif-item-body">
                  <p className="fs-13 text-theme notif-item-text">
                    {notif.message}
                  </p>
                  <div className="d-flex align-items-center justify-content-between mt-1">
                    <span className="fs-11 notif-item-time">
                      {formatTime(notif.created_at)}
                    </span>
                    <span className="fs-11 fw-semibold d-inline-flex align-items-center notif-item-link">
                      Track Case →
                    </span>
                  </div>
                </div>

                {/* Unread dot */}
                {!notif.is_read && (
                  <span className="rounded-circle flex-shrink-0 notif-unread-dot" />
                )}
              </div>
            ))
          )}
        </div>
      )}

    </div>
  );
};

export default NotificationDropdown;

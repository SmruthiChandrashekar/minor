import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/api';
import { useAuth } from '../context/AuthProvider';

/**
 * NotificationDropdown — Bell icon with unread count badge and dropdown list.
 * Polls for new notifications every 30 seconds.
 */
const NotificationDropdown = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

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
      case 'GRIEVANCE_RECEIVED': return '📩';
      case 'GRIEVANCE_ROUTED': return '🔀';
      case 'CHATBOT_HANDOFF': return '🤝';
      case 'TIER_ASSIGNED': return '📊';
      case 'SLA_BREACHED': return '⏰';
      case 'ESCALATED': return '⬆️';
      case 'RESOLVED': return '✅';
      case 'REOPENED': return '🔄';
      default: return '🔔';
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
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell Icon */}
      <button
        id="notification-bell"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          padding: '4px 8px',
          fontSize: '18px',
          color: 'var(--text-color)',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => e.target.style.transform = 'scale(1.15)'}
        onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '0',
            right: '2px',
            background: '#ef4444',
            color: '#fff',
            borderRadius: '50%',
            width: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: '700',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            animation: 'notif-pulse 2s ease-in-out infinite',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: '0',
          width: '380px',
          maxHeight: '460px',
          overflowY: 'auto',
          backgroundColor: 'var(--card-bg, #fff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 2px 10px rgba(0,0,0,0.08)',
          zIndex: 9999,
          animation: 'notif-slide-in 0.2s ease-out',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
          }}>
            <h6 style={{ margin: 0, fontWeight: '700', fontSize: '15px', color: 'var(--text-color)' }}>
              Notifications
              {unreadCount > 0 && (
                <span style={{
                  marginLeft: '8px',
                  background: '#ef4444',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: '600',
                }}>
                  {unreadCount}
                </span>
              )}
            </h6>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#3b82f6',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: '600',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔔</div>
              <p style={{ color: '#94a3b8', margin: 0, fontSize: '14px' }}>No notifications yet</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.notification_id}
                onClick={() => !notif.is_read && handleMarkRead(notif.notification_id)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-color, #f1f5f9)',
                  cursor: notif.is_read ? 'default' : 'pointer',
                  backgroundColor: notif.is_read ? 'transparent' : 'rgba(59, 130, 246, 0.04)',
                  transition: 'background-color 0.2s',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                }}
                onMouseEnter={(e) => {
                  if (!notif.is_read) e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = notif.is_read ? 'transparent' : 'rgba(59, 130, 246, 0.04)';
                }}
              >
                {/* Icon */}
                <span style={{ fontSize: '18px', flexShrink: 0, marginTop: '2px' }}>
                  {getNotificationIcon(notif.type)}
                </span>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: '0 0 4px 0',
                    fontSize: '13px',
                    fontWeight: notif.is_read ? '400' : '600',
                    color: 'var(--text-color)',
                    lineHeight: '1.4',
                  }}>
                    {notif.message}
                  </p>
                  <span style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                  }}>
                    {formatTime(notif.created_at)}
                  </span>
                </div>

                {/* Unread dot */}
                {!notif.is_read && (
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#3b82f6',
                    flexShrink: 0,
                    marginTop: '6px',
                  }} />
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes notif-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes notif-slide-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default NotificationDropdown;

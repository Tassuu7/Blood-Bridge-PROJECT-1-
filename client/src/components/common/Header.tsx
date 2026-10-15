import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { DemoSwitcherModal } from '../modals/DemoSwitcherModal';
import {
  Bell,
  Check,
  ChevronDown,
  LogOut,
  Radio,
  Zap,
  User,
  HeartHandshake,
  Trophy,
} from 'lucide-react';

export const Header: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { isConnected } = useSocket();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const getDashboardPath = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'DONOR':
        return '/donor/dashboard';
      case 'REQUESTER':
        return '/requester/dashboard';
      case 'HOSPITAL':
        return '/hospital/dashboard';
      case 'ADMIN':
        return '/admin/dashboard';
      default:
        return '/';
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-6">
            <Link to="/" className="flex items-center space-x-3 group">
              <img
                src="/logo.svg"
                alt="BloodBridge Logo"
                className="w-8 h-8 group-hover:scale-105 transition-transform"
              />
              <div>
                <span className="font-extrabold text-lg text-slate-900 tracking-tight flex items-center gap-1">
                  Blood<span className="text-crimson-700">Bridge</span>
                </span>
                <span className="hidden sm:block text-[10px] text-slate-500 font-medium -mt-1 tracking-wider uppercase">
                  Emergency Coordination
                </span>
              </div>
            </Link>

            {/* Real-Time WebSocket Connection Indicator */}
            <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium">
              <span className="relative flex h-2 w-2">
                {isConnected ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                )}
              </span>
              <span className="text-slate-600 text-[11px]">
                {isConnected ? 'Real-Time Sync' : 'Reconnecting...'}
              </span>
            </div>
          </div>

          {/* Navigation & Actions */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Demo Switcher Button */}
            <button
              onClick={() => setIsDemoModalOpen(true)}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition shadow-sm"
              title="Fast role switcher for testing"
            >
              <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
              <span className="hidden sm:inline">Demo Switcher</span>
            </button>

            {isAuthenticated && (
              <Link
                to={getDashboardPath()}
                className="text-xs font-semibold text-slate-700 hover:text-crimson-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                Dashboard
              </Link>
            )}

            <Link
              to="/leaderboard"
              className="flex items-center space-x-1 text-xs font-semibold text-slate-700 hover:text-crimson-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition"
              title="Community Hall of Fame"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden md:inline">Leaderboard</span>
            </Link>

            {/* In-App Notifications Center */}
            {isAuthenticated && (
              <div className="relative">
                <button
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                  aria-label="View notifications"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold text-white bg-crimson-600 rounded-full px-1 shadow-sm">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown */}
                {isNotificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-modal border border-slate-200 py-3 z-50 animate-scale-up">
                    <div className="flex items-center justify-between px-4 pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-slate-900">Notifications</h4>
                        {unreadCount > 0 && (
                          <span className="text-[10px] bg-red-100 text-crimson-700 font-bold px-1.5 py-0.5 rounded-full">
                            {unreadCount} new
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markAllAsRead()}
                          className="text-[11px] text-crimson-700 hover:underline font-medium"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400">
                          No notifications yet.
                        </div>
                      ) : (
                        notifications.slice(0, 8).map((notif) => (
                          <div
                            key={notif.id}
                            onClick={() => {
                              if (!notif.isRead) markAsRead(notif.id);
                              if (notif.linkUrl) navigate(notif.linkUrl);
                              setIsNotificationsOpen(false);
                            }}
                            className={`p-3 text-left hover:bg-slate-50 cursor-pointer transition flex items-start space-x-2.5 ${
                              !notif.isRead ? 'bg-red-50/40' : ''
                            }`}
                          >
                            <span
                              className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${
                                !notif.isRead ? 'bg-crimson-600' : 'bg-transparent'
                              }`}
                            />
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-slate-900 leading-tight">
                                {notif.title}
                              </p>
                              <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                                {notif.message}
                              </p>
                              <span className="text-[9px] text-slate-400 mt-1 block">
                                {new Date(notif.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Auth Buttons or User Menu */}
            {isAuthenticated && user ? (
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center space-x-2 pl-2 pr-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 transition"
                >
                  <div className="w-6 h-6 rounded-full bg-crimson-700 text-white flex items-center justify-center text-[10px] font-bold">
                    {user.fullName.charAt(0)}
                  </div>
                  <span className="text-xs font-semibold text-slate-800 hidden sm:inline max-w-[120px] truncate">
                    {user.fullName}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200 uppercase">
                    {user.role}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-modal border border-slate-200 py-1.5 z-50">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-900 truncate">{user.fullName}</p>
                      <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                    </div>
                    <Link
                      to={getDashboardPath()}
                      onClick={() => setIsUserMenuOpen(false)}
                      className="block px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition"
                    >
                      Dashboard
                    </Link>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                        navigate('/');
                      }}
                      className="w-full text-left flex items-center space-x-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  to="/login"
                  className="text-xs font-semibold text-slate-700 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  className="text-xs font-semibold text-white bg-crimson-700 hover:bg-crimson-800 px-3.5 py-1.5 rounded-lg shadow-sm transition"
                >
                  Join BloodBridge
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Demo Switcher Modal */}
      <DemoSwitcherModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />
    </>
  );
};

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { Header } from './components/common/Header';
import { Footer } from './components/common/Footer';
import { ToastContainer } from './components/common/ToastContainer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineIndicator } from './components/OfflineIndicator';
import { EmergencyBanner } from './components/EmergencyBanner';

// Pages
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DonorDashboard } from './pages/DonorDashboard';
import { RequesterDashboard } from './pages/RequesterDashboard';
import { HospitalDashboard } from './pages/HospitalDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { NotFoundPage, ForbiddenPage } from './pages/NotFoundPage';
import { UserRole } from '@shared/types';

// Protected Route Guard
const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}> = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-xs font-bold text-slate-400">Verifying session credentials...</div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role) && user.role !== 'ADMIN') {
    return <ForbiddenPage />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <SocketProvider>
            <NotificationProvider>
              <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
                <EmergencyBanner />
                <Header />
                <main className="flex-1">
                  <Routes>
                    {/* Public Pages */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/leaderboard" element={<LeaderboardPage />} />

                    {/* Donor Portal */}
                    <Route
                      path="/donor/dashboard"
                      element={
                        <ProtectedRoute allowedRoles={['DONOR']}>
                          <DonorDashboard />
                        </ProtectedRoute>
                      }
                    />

                    {/* Requester Portal */}
                    <Route
                      path="/requester/dashboard"
                      element={
                        <ProtectedRoute allowedRoles={['REQUESTER']}>
                          <RequesterDashboard />
                        </ProtectedRoute>
                      }
                    />

                    {/* Hospital Verification Center */}
                    <Route
                      path="/hospital/dashboard"
                      element={
                        <ProtectedRoute allowedRoles={['HOSPITAL']}>
                          <HospitalDashboard />
                        </ProtectedRoute>
                      }
                    />

                    {/* Admin Command Center */}
                    <Route
                      path="/admin/dashboard"
                      element={
                        <ProtectedRoute allowedRoles={['ADMIN']}>
                          <AdminDashboard />
                        </ProtectedRoute>
                      }
                    />

                    {/* Errors */}
                    <Route path="/forbidden" element={<ForbiddenPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </main>
                <Footer />
                <ToastContainer />
                <OfflineIndicator />
              </div>
            </NotificationProvider>
          </SocketProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default App;

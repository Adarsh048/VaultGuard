import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/Layout/AppLayout';

import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { CredentialVault } from './pages/CredentialVault';
import { AccessRequests } from './pages/AccessRequests';
import { CredentialRotation } from './pages/CredentialRotation';
import { Monitoring } from './pages/Monitoring';
import { Incidents } from './pages/Incidents';
import { AuditLogs } from './pages/AuditLogs';
import { Settings } from './pages/Settings';

const ProtectedRoute: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({
  children,
  adminOnly = false,
}) => {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
          <span className="text-xs text-slate-400 font-medium tracking-wide">
            Verifying PAM Session...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="vault" element={<CredentialVault />} />
            <Route path="requests" element={<AccessRequests />} />

            {/* Admin-only Routes */}
            <Route
              path="rotation"
              element={
                <ProtectedRoute adminOnly>
                  <CredentialRotation />
                </ProtectedRoute>
              }
            />
            <Route
              path="monitoring"
              element={
                <ProtectedRoute adminOnly>
                  <Monitoring />
                </ProtectedRoute>
              }
            />
            <Route
              path="incidents"
              element={
                <ProtectedRoute adminOnly>
                  <Incidents />
                </ProtectedRoute>
              }
            />
            <Route
              path="audit"
              element={
                <ProtectedRoute adminOnly>
                  <AuditLogs />
                </ProtectedRoute>
              }
            />

            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;


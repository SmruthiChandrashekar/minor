import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "../context/LanguageContext";
import { AuthProvider, useAuth } from "../context/AuthProvider";
import Layout from "../layout/Layout";
import ProtectedRoute from "./ProtectedRoute";

import Index from "../pages/Index";
import Track from "../pages/Track";
import Help from "../pages/Help";
import Auth from "../pages/Auth";
import LodgeSelection from "../pages/LodgeSelection";
import LodgeInternal from "../pages/LodgeInternal";
import LodgeContract from "../pages/LodgeContract";
import LodgeExternal from "../pages/LodgeExternal";
import Dashboard from "../pages/Dashboard";
import AdminLogin from "../pages/AdminLogin";
import AdminDashboard from "../pages/AdminDashboard";
import SuperAdminPortal from "../pages/SuperAdminPortal";

const MainRoutes = () => {
  const { user, isAdmin, isSuperAdmin, loading } = useAuth();
  const isAuthenticated = !!user;

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: "100vh" }}>
        <div className="spinner-border text-primary" role="status"></div>
      </div>
    );
  }

  // Dynamic root element
  const getRootElement = () => {
    if (isAdmin) return <AdminDashboard />;
    if (isAuthenticated) return <Dashboard />;
    return <Index />;
  };

  return (
    <Layout>
      <Routes>
        <Route path="/" element={getRootElement()} />
        
        {/* Protected User Routes */}
        <Route path="/track" element={<ProtectedRoute><Track /></ProtectedRoute>} />
        <Route path="/lodge-selection" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <ProtectedRoute><LodgeSelection /></ProtectedRoute>} />
        <Route path="/lodge-internal" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <ProtectedRoute><LodgeInternal /></ProtectedRoute>} />
        <Route path="/lodge-contract" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <ProtectedRoute><LodgeContract /></ProtectedRoute>} />
        <Route path="/lodge-external" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <ProtectedRoute><LodgeExternal /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

        {/* Public Routes */}
        <Route path="/help" element={<Help />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/login" element={isAuthenticated && !isAdmin ? <Navigate to="/" replace /> : <Auth />} />
        <Route path="/register" element={<Auth />} />

        {/* Admin Routes */}
        <Route path="/admin" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <AdminLogin />} />
        <Route path="/admin/login" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <AdminLogin />} />
        <Route path="/admin/dashboard" element={isAdmin ? <AdminDashboard /> : <Navigate to="/admin/login" replace />} />
        <Route path="/admin/portal" element={isSuperAdmin ? <SuperAdminPortal /> : (isAdmin ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/admin/login" replace />)} />
      </Routes>
    </Layout>
  );
};

const AppRoutes = () => {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <MainRoutes />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
};

export default AppRoutes;
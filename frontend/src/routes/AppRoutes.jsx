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

const MainRoutes = () => {
  const { user, loading, adminUser } = useAuth();
  const isAuthenticated = !!user;
  const isAdminAuthenticated = !!adminUser;

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: "100vh" }}>
        <div className="spinner-border text-primary" role="status"></div>
      </div>
    );
  }

  // Dynamic root element
  const getRootElement = () => {
    if (isAdminAuthenticated) return <AdminDashboard />;
    if (isAuthenticated) return <Dashboard />;
    return <Index />;
  };

  return (
    <Layout>
      <Routes>
        <Route path="/" element={getRootElement()} />
        
        {/* Protected Routes */}
        <Route path="/track" element={<ProtectedRoute><Track /></ProtectedRoute>} />
        <Route path="/lodge-selection" element={<ProtectedRoute><LodgeSelection /></ProtectedRoute>} />
        <Route path="/lodge-internal" element={<ProtectedRoute><LodgeInternal /></ProtectedRoute>} />
        <Route path="/lodge-contract" element={<ProtectedRoute><LodgeContract /></ProtectedRoute>} />
        <Route path="/lodge-external" element={<ProtectedRoute><LodgeExternal /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

        <Route path="/help" element={<Help />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/register" element={<Auth />} />

        {/* Admin Routes */}
        <Route path="/admin" element={isAdminAuthenticated ? <Navigate to="/" replace /> : <AdminLogin />} />
        <Route path="/admin/dashboard" element={isAdminAuthenticated ? <Navigate to="/" replace /> : <AdminLogin />} />
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
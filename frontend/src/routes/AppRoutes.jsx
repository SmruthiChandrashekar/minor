import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "../context/LanguageContext";
import { AuthProvider, useAuth } from "../context/AuthProvider";
import Layout from "../layout/Layout";
import ProtectedRoute from "./ProtectedRoute";

const Index = lazy(() => import("../pages/Index"));
const Track = lazy(() => import("../pages/Track"));
const Help = lazy(() => import("../pages/Help"));
const Auth = lazy(() => import("../pages/Auth"));
const LodgeSelection = lazy(() => import("../pages/LodgeSelection"));
const LodgeInternal = lazy(() => import("../pages/LodgeInternal"));
const LodgeContract = lazy(() => import("../pages/LodgeContract"));
const LodgeExternal = lazy(() => import("../pages/LodgeExternal"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const AdminLogin = lazy(() => import("../pages/AdminLogin"));
const AdminDashboard = lazy(() => import("../pages/AdminDashboard"));
const SuperAdminPortal = lazy(() => import("../pages/SuperAdminPortal"));
const PolicyAssistant = lazy(() => import("../pages/PolicyAssistant"));
const Profile = lazy(() => import("../pages/Profile"));

const PageLoader = () => (
  <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
    <div className="spinner-border text-primary" role="status"></div>
  </div>
);

const MainRoutes = () => {
  const { user, isAdmin, isSuperAdmin, loading } = useAuth();
  const isAuthenticated = !!user;

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
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
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={getRootElement()} />
        
        {/* Protected User Routes */}
        <Route path="/track" element={<ProtectedRoute><Track /></ProtectedRoute>} />
        <Route path="/lodge-selection" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <ProtectedRoute><LodgeSelection /></ProtectedRoute>} />
        <Route path="/lodge-internal" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <ProtectedRoute><LodgeInternal /></ProtectedRoute>} />
        <Route path="/lodge-contract" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <ProtectedRoute><LodgeContract /></ProtectedRoute>} />
        <Route path="/lodge-external" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <ProtectedRoute><LodgeExternal /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

        {/* Public Routes */}
        <Route path="/assistant" element={<PolicyAssistant />} />
        <Route path="/help" element={<Help />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/login" element={isAuthenticated && !isAdmin && !window.location.search.includes("message=") && !sessionStorage.getItem("phoneVerifyPending") ? <Navigate to="/" replace /> : <Auth />} />
        <Route path="/register" element={<Auth />} />

        {/* Admin Routes */}
        <Route path="/admin" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <AdminLogin />} />
        <Route path="/admin/login" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <AdminLogin />} />
        <Route path="/admin/dashboard" element={isAdmin ? <AdminDashboard /> : <Navigate to="/admin/login" replace />} />
        <Route path="/admin/portal" element={isSuperAdmin ? <SuperAdminPortal /> : (isAdmin ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/admin/login" replace />)} />
      </Routes>
      </Suspense>
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
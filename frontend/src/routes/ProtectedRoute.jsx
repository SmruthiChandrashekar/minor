import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div>Loading...</div>;

  if (!user) {
    // Keep the query string (e.g. ?project=...) so it survives the trip through login
    return <Navigate to={`/login${location.search}`} replace />;
  }

  return children;
};

export default ProtectedRoute;
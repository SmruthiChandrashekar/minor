import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../context/AuthProvider";

const ProtectedRoute = ({ children }) => {
  const { adminUser } = useAuth();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      console.log("Session:", session);
      console.log("AdminUser:", adminUser);
      setSession(session);
      setLoading(false);
    };

    getSession();
  }, [adminUser]);

  if (loading) return <div>Loading...</div>;

  // Allow access if either a Supabase session exists OR an adminUser is present
  if (!session && !adminUser) {
    return <Navigate to="/login" />;
  }

  return children;
};

export default ProtectedRoute;
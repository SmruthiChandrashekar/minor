import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../services/supabaseClient";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserDetails(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserDetails(session.user.id);
      } else {
        setUserDetails(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserDetails = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("user_id", userId)
        .single();
      
      if (!error && data) {
        setUserDetails(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const refreshUserDetails = async () => {
    if (user?.id) {
      await fetchUserDetails(user.id);
    }
  };

  const updateUserDetailsLocally = (updatedFields) => {
    setUserDetails(prev => ({ ...prev, ...updatedFields }));
  };

  // Derived state for role-based access
  const isAdmin = ["super_admin", "admin"].includes(userDetails?.role);
  const isSuperAdmin = userDetails?.role === "super_admin";

  return (
    <AuthContext.Provider value={{ 
      user, 
      userDetails, 
      isAdmin, 
      isSuperAdmin, 
      loading, 
      logout,
      refreshUserDetails,
      updateUserDetailsLocally
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

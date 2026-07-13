import { supabase, API_BASE_URL } from "./supabaseClient";

export async function apiClient(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  const headers = { ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  
  // If we're not sending FormData (like file uploads), set Content-Type to JSON
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  let res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  
  if (res.status === 401) {
    // Token might be expired — try refresh
    const { data } = await supabase.auth.refreshSession();
    if (data?.session) {
      headers["Authorization"] = `Bearer ${data.session.access_token}`;
      res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    } else {
      window.location.href = "/login?message=Session expired. Please log in again.";
    }
  }
  
  return res;
}

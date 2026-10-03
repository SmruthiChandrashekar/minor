import { supabase, API_BASE_URL } from "./supabaseClient";

let isRefreshing = false;
let refreshFailed = false;

async function handleSessionExpired() {
  refreshFailed = true;
  try {
    await supabase.auth.signOut();
  } catch (_) {}
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("sb-") || key.includes("supabase.auth")) {
        localStorage.removeItem(key);
      }
    });
  } catch (_) {}

  // Only redirect if not already on login or auth page
  if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/auth")) {
    window.location.href = "/login?message=Session expired. Please log in again.";
  }
}

export async function apiClient(path, options = {}) {
  // If a previous refresh already failed, stop making calls (session is dead)
  if (refreshFailed) return new Response(null, { status: 401 });

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
    // Avoid multiple simultaneous refresh attempts
    if (isRefreshing) return res;
    isRefreshing = true;

    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data?.session) {
        headers["Authorization"] = `Bearer ${data.session.access_token}`;
        res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
      } else {
        await handleSessionExpired();
      }
    } catch (err) {
      await handleSessionExpired();
    } finally {
      isRefreshing = false;
    }
  }
  
  return res;
}

// Reset the failed flag on successful login (call this from AuthProvider after sign-in)
export function resetApiClientState() {
  refreshFailed = false;
  isRefreshing = false;
}

/* Next.js bridge for the retained vanilla-JS hotel dashboard. */
(() => {
  let csrf = ""; let currentUser = null; const $ = (id) => document.getElementById(id);
  function getClient() {
    if (window.HotelApi) return window.HotelApi;
    if (window.axios) {
      const api = window.axios.create({
        baseURL: "/api/index.php",
        timeout: 15000,
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
      });
      api.interceptors.response.use(
        (res) => res,
        (err) => Promise.reject(new Error(err.response?.data?.error || err.message || "Network request failed"))
      );
      window.HotelApi = api;
      return api;
    }
    return {
      async request(config) {
        let url = config.url || "/api/index.php";
        if (config.params) {
          const qs = new URLSearchParams(config.params).toString();
          url += (url.includes("?") ? "&" : "?") + qs;
        }
        const res = await fetch(url, {
          method: config.method || "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.headers || {}),
          },
          credentials: "include",
          body: config.method === "GET" ? undefined : JSON.stringify(config.data || {}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return { data };
      },
    };
  }
  async function request(action, data = {}, method = "POST") {
    const client = getClient();
    const config = { method, headers: {} };
    if (method === "GET") config.params = { action, ...data };
    else {
      if (csrf) config.headers["X-CSRF-Token"] = csrf;
      config.data = { action, ...data };
    }
    const result = (await client.request(config)).data;
    if (result?.csrf) csrf = result.csrf;
    return result;
  }
  async function checkSession() { try { const session = await request("session", {}, "GET"); currentUser = session.user || null; csrf = session.csrf || ""; if (currentUser) showApp(); else showLogin(); } catch (_) { showLogin(); } }
  function showLogin() { $("login-wrapper")?.classList.remove("d-none"); $("dashboard-container")?.classList.add("d-none"); if ($("register-container")) $("register-container").style.display = "none"; }
  function showApp() {
    $("login-wrapper")?.classList.add("d-none");
    $("dashboard-container")?.classList.remove("d-none");
    if ($("user-display-name")) $("user-display-name").textContent = currentUser.username;
    if ($("user-display-role")) $("user-display-role").textContent = currentUser.role;
    if ($("user-avatar")) $("user-avatar").textContent = String(currentUser.username || "?").slice(0, 2).toUpperCase();
    if ($("topbar-date")) $("topbar-date").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const deptBadges = {
      maintenance: 'Maintenance Department',
      housekeeping: 'Housekeeping Department',
      service: 'Service Department',
      bar: 'Bar Department',
      restaurant: 'Restaurant Department',
      valet: 'Valet Department',
      laundry: 'Laundry Department',
      cashier: 'Cashier & Billing',
      frontdesk: 'Front Desk & Billing',
      manager: 'Hotel Management',
      admin: 'Hotel Administration'
    };
    const badgeEl = document.querySelector('.navbar-badge');
    if (badgeEl && currentUser?.role) {
      const r = (currentUser.role || '').toLowerCase();
      badgeEl.textContent = deptBadges[r] || (currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1));
    }
    document.dispatchEvent(new CustomEvent("hotel:authenticated", { detail: { user: currentUser } }));
  }
  async function login() { const button = $("btn-login"), username = $("login-username")?.value.trim() || "", password = $("login-password")?.value || ""; if (!username || !password) return window.HotelDialogs.alert({ title: "Sign in", text: "Enter username and password.", icon: "warning" }); if (button) { button.disabled = true; button.textContent = "Signing in…"; } try { const result = await request("login", { username, password }); currentUser = result.user; csrf = result.csrf || ""; showApp(); } catch (error) { await window.HotelDialogs.alert({ title: "Sign-in failed", text: error.message, icon: "error" }); } finally { if (button) { button.disabled = false; button.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> Sign In'; } } }
  async function logout() { try { await request("logout", {}); } catch (_) {} currentUser = null; csrf = ""; showLogin(); }
  window.HotelAuth = { request, getUser: () => currentUser, getCsrf: () => csrf, refreshSession: checkSession };
  function initializeAuth() { $("btn-login")?.addEventListener("click", login); $("login-password")?.addEventListener("keydown", (event) => { if (event.key === "Enter") login(); }); $("btn-logout")?.addEventListener("click", logout); $("btn-toggle-login-pwd")?.addEventListener("click", () => { const password = $("login-password"); if (password) password.type = password.type === "password" ? "text" : "password"; }); $("link-to-register")?.addEventListener("click", (event) => { event.preventDefault(); window.HotelDialogs.alert({ title: "Staff accounts", text: "Staff accounts are provisioned by the administrator. Public staff registration is disabled.", icon: "info" }); }); checkSession(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeAuth, { once: true }); else initializeAuth();
})();

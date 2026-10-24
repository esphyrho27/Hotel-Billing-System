/* Staff account & role permission management. The API remains authoritative. */
(() => {
  const $ = (id) => document.getElementById(id);
  const roles = [
    "admin",
    "manager",
    "frontdesk",
    "cashier",
    "service",
    "housekeeping",
    "bar",
    "restaurant",
    "parking_valet",
    "valet",
    "parking",
    "laundry",
    "maintenance",
    "other",
  ];
  const configurableRoles = [
    { id: "manager", label: "Operations Manager", dept: "Management" },
    { id: "frontdesk", label: "Front Desk Staff", dept: "Front Desk" },
    { id: "cashier", label: "Cashier & Billing", dept: "Billing" },
    { id: "maintenance", label: "Maintenance Technician", dept: "Maintenance" },
    { id: "housekeeping", label: "Housekeeping Staff", dept: "Housekeeping" },
    { id: "restaurant", label: "Restaurant & Food Service", dept: "Dining" },
    { id: "bar", label: "Bar & Beverage Staff", dept: "Bar" },
    { id: "valet", label: "Valet & Parking Staff", dept: "Valet" },
    { id: "laundry", label: "Laundry Service Staff", dept: "Laundry" },
    { id: "service", label: "General Service Concierge", dept: "Concierge" },
    { id: "other", label: "Other Department Staff", dept: "Operations" },
  ];

  let activeTab = "accounts"; // "accounts" | "permissions"
  let selectedPermRole = "maintenance";
  let cachedDefinitions = [];
  let currentRolePerms = new Set();

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
    );

  function notify(message, failed = false) {
    if (window.HotelDialogs?.toast) {
      return window.HotelDialogs.toast({ title: message, icon: failed ? "error" : "success" });
    }
    const element = document.createElement("div");
    element.className = `alert ${failed ? "alert-danger" : "alert-success"} shadow position-fixed`;
    element.style.cssText = "right:20px;bottom:20px;z-index:3000;max-width:420px";
    element.textContent = message;
    document.body.appendChild(element);
    setTimeout(() => element.remove(), 4200);
  }

  function roleOptions(selected, currentUserRole = "admin") {
    const list = [...roles];
    if (currentUserRole !== "admin") {
      const adminIdx = list.indexOf("admin");
      if (adminIdx !== -1) list.splice(adminIdx, 1);
    }
    if (selected && !list.includes(selected)) {
      list.push(selected);
    }
    return list
      .map(
        (role) =>
          `<option value="${role}" ${selected === role ? "selected" : ""}>${role}</option>`,
      )
      .join("");
  }

  function computeAllowedModules(perms) {
    const has = (k) => perms.has("*") || perms.has(k);
    const mods = [];
    if (has("dashboard.view") || has("stays.checkin")) mods.push("Dashboard");
    if (has("stays.view") || has("stays.checkout") || has("rooms.transfer")) mods.push("Active Stays");
    if (has("rooms.view") || has("rooms.status")) mods.push("Room Board");
    if (has("service_catalog.view") || has("settings.manage")) mods.push("Menu & Catalog");
    if (has("billing.view") || has("payments.process") || has("charges.create") || has("refunds.view") || has("refunds.request")) mods.push("Billing & Payments");
    if (has("discounts.approve")) mods.push("Discount Approvals");
    if (has("early_checkout.approve") || has("early_checkout.view")) mods.push("Early Checkouts");
    if (has("service_requests.view") || has("service_requests.fulfill") || has("service_requests.assign")) mods.push("Service Requests");
    if (has("reports.financial.view")) mods.push("Financial Reports");
    if (has("audit_logs.view")) mods.push("Audit Logs");
    if (has("users.view") || has("users.update") || has("roles.assign")) mods.push("Staff Accounts");
    mods.push("Settings");
    return Array.from(new Set(mods));
  }

  async function renderPermissionsManager(container) {
    try {
      const resp = await window.HotelAuth.request("permissions_get", { role: selectedPermRole }, "GET");
      cachedDefinitions = resp.permission_definitions || [];
      currentRolePerms = new Set(resp.permissions || []);
      const roleObj = configurableRoles.find((r) => r.id === selectedPermRole) || {
        id: selectedPermRole,
        label: selectedPermRole,
        dept: "Department",
      };

      // Group definitions by category
      const categories = {};
      cachedDefinitions.forEach((def) => {
        const cat = def.category || "General";
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(def);
      });

      const allowedModules = computeAllowedModules(currentRolePerms);

      container.innerHTML = `
        <div class="card border-0 shadow-sm mb-4">
          <div class="card-body p-3 p-md-4">
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 pb-3 border-bottom mb-3">
              <div>
                <h5 class="fw-bold mb-1"><i class="bi bi-shield-lock me-2 text-primary"></i>Role Permissions Management</h5>
                <p class="text-muted small mb-0">Select a user role, check or uncheck allowed modules and actions, and save changes to persist to the database.</p>
              </div>
              <div class="d-flex flex-wrap align-items-center gap-2">
                <label for="perm-role-select" class="form-label mb-0 fw-semibold small text-muted">Selected Role:</label>
                <select id="perm-role-select" class="form-select form-select-sm w-auto fw-bold" style="min-width: 200px;">
                  ${configurableRoles
                    .map(
                      (r) =>
                        `<option value="${r.id}" ${r.id === selectedPermRole ? "selected" : ""}>${r.label} (${r.dept})</option>`,
                    )
                    .join("")}
                </select>
              </div>
            </div>

            <!-- Role Summary & Dynamic Live Preview -->
            <div class="alert alert-light border p-3 rounded mb-3">
              <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <div>
                  <span class="badge text-bg-primary fs-6 px-3 py-1 me-2">${esc(roleObj.label)}</span>
                  <span class="text-muted small">Department: <strong>${esc(roleObj.dept)}</strong></span>
                </div>
                <div class="d-flex flex-wrap gap-1">
                  <button type="button" class="btn btn-sm btn-outline-primary" id="btn-perm-check-all"><i class="bi bi-check-all me-1"></i>Check All</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-perm-uncheck-all"><i class="bi bi-dash-circle me-1"></i>Uncheck All</button>
                  <button type="button" class="btn btn-sm btn-outline-warning" id="btn-perm-reset"><i class="bi bi-arrow-counterclockwise me-1"></i>Reset to Defaults</button>
                  <button type="button" class="btn btn-sm btn-primary px-3 fw-bold" id="btn-perm-save-top"><i class="bi bi-check2-circle me-1"></i>Save Permissions</button>
                </div>
              </div>
              <div class="mt-2 pt-2 border-top">
                <span class="small fw-semibold text-secondary me-2"><i class="bi bi-eye me-1"></i>Visible Sidebar Modules for ${esc(roleObj.label)}:</span>
                <span id="perm-modules-preview" class="d-inline-flex flex-wrap gap-1">
                  ${allowedModules.map((m) => `<span class="badge text-bg-light border text-dark">${esc(m)}</span>`).join("")}
                </span>
              </div>
            </div>

            <!-- Search Filter -->
            <div class="input-group input-group-sm mb-3">
              <span class="input-group-text bg-white"><i class="bi bi-search text-muted"></i></span>
              <input type="text" id="perm-search" class="form-control" placeholder="Search permissions (e.g. check-in, billing, room, repair, reports)…">
            </div>

            <!-- Permission Groups -->
            <div id="perm-groups-container">
              ${Object.entries(categories)
                .map(([catName, defs]) => {
                  const allCatChecked = defs.every((d) => currentRolePerms.has(d.key));
                  return `
                    <div class="perm-category-block card border-0 shadow-sm mb-3">
                      <div class="card-header bg-light py-2 px-3 d-flex justify-content-between align-items-center">
                        <span class="fw-bold text-dark"><i class="bi bi-folder2-open me-2 text-primary"></i>${esc(catName)}</span>
                        <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none text-primary cat-toggle-all" data-category="${esc(catName)}">
                          ${allCatChecked ? "Deselect section" : "Select section"}
                        </button>
                      </div>
                      <div class="card-body p-3">
                        <div class="row g-2">
                          ${defs
                            .map((def) => {
                              const checked = currentRolePerms.has(def.key);
                              return `
                                <div class="col-12 col-lg-6 perm-item" data-search-text="${esc(def.label.toLowerCase() + " " + def.description.toLowerCase() + " " + def.key.toLowerCase())}">
                                  <div class="card border rounded-3 h-100 perm-card ${checked ? "border-primary bg-primary bg-opacity-10 shadow-sm" : "border-secondary-subtle bg-white"}">
                                    <div class="card-body p-3 d-flex align-items-start gap-3">
                                      <div class="pt-1">
                                        <input class="form-check-input perm-checkbox m-0" type="checkbox" value="${esc(def.key)}" id="perm_${esc(def.key)}" ${checked ? "checked" : ""} style="width: 1.25rem; height: 1.25rem; cursor: pointer;">
                                      </div>
                                      <div class="flex-grow-1 min-w-0">
                                        <label class="form-check-label fw-bold d-block text-dark mb-1" for="perm_${esc(def.key)}" style="cursor: pointer; line-height: 1.3;">
                                          ${esc(def.label)}
                                        </label>
                                        <div class="small text-muted mb-2" style="font-size: 0.82rem; line-height: 1.35;">${esc(def.description)}</div>
                                        <span class="badge text-bg-light border text-secondary" style="font-size: 11px; font-weight: 500;">
                                          <i class="bi bi-box me-1"></i>Module: ${esc(def.module)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>`;
                            })
                            .join("")}
                        </div>
                      </div>
                    </div>`;
                })
                .join("")}
            </div>

            <!-- Bottom Save Bar -->
            <div class="d-flex justify-content-between align-items-center pt-3 border-top mt-4 flex-wrap gap-2">
              <span class="small text-muted"><i class="bi bi-info-circle me-1"></i>Permissions take effect immediately for active users across all devices.</span>
              <button type="button" class="btn btn-primary px-4 fw-bold" id="btn-perm-save-bottom">
                <i class="bi bi-save me-1"></i>Save Role Permissions
              </button>
            </div>
          </div>
        </div>`;

      // Event Listeners for Permissions Manager
      const roleSelect = container.querySelector("#perm-role-select");
      roleSelect?.addEventListener("change", (e) => {
        selectedPermRole = e.target.value;
        renderPermissionsManager(container);
      });

      // Checkbox changes update live module preview
      const updatePreview = () => {
        const checkedPerms = new Set(
          Array.from(container.querySelectorAll(".perm-checkbox:checked")).map((cb) => cb.value),
        );
        currentRolePerms = checkedPerms;
        const mods = computeAllowedModules(checkedPerms);
        const previewEl = container.querySelector("#perm-modules-preview");
        if (previewEl) {
          previewEl.innerHTML = mods
            .map((m) => `<span class="badge text-bg-light border text-dark">${esc(m)}</span>`)
            .join("");
        }

        // Highlight card styling on change
        container.querySelectorAll(".perm-checkbox").forEach((cb) => {
          const card = cb.closest(".perm-card");
          if (card) {
            card.classList.toggle("border-primary", cb.checked);
            card.classList.toggle("bg-primary", cb.checked);
            card.classList.toggle("bg-opacity-10", cb.checked);
            card.classList.toggle("shadow-sm", cb.checked);
            card.classList.toggle("border-secondary-subtle", !cb.checked);
            card.classList.toggle("bg-white", !cb.checked);
          }
        });
      };

      container.querySelectorAll(".perm-checkbox").forEach((cb) => {
        cb.addEventListener("change", updatePreview);
      });

      // Allow clicking entire card to toggle checkbox
      container.querySelectorAll(".perm-card").forEach((card) => {
        card.addEventListener("click", (e) => {
          if (e.target.tagName.toLowerCase() === "input" || e.target.tagName.toLowerCase() === "label") return;
          const cb = card.querySelector(".perm-checkbox");
          if (cb) {
            cb.checked = !cb.checked;
            updatePreview();
          }
        });
      });

      // Check All / Uncheck All
      container.querySelector("#btn-perm-check-all")?.addEventListener("click", () => {
        container.querySelectorAll(".perm-checkbox").forEach((cb) => (cb.checked = true));
        updatePreview();
      });

      container.querySelector("#btn-perm-uncheck-all")?.addEventListener("click", () => {
        container.querySelectorAll(".perm-checkbox").forEach((cb) => (cb.checked = false));
        updatePreview();
      });

      // Category toggle all
      container.querySelectorAll(".cat-toggle-all").forEach((btn) => {
        btn.addEventListener("click", () => {
          const block = btn.closest(".perm-category-block");
          if (!block) return;
          const checkboxes = Array.from(block.querySelectorAll(".perm-checkbox"));
          const someUnchecked = checkboxes.some((c) => !c.checked);
          checkboxes.forEach((c) => (c.checked = someUnchecked));
          btn.textContent = someUnchecked ? "Deselect section" : "Select section";
          updatePreview();
        });
      });

      // Reset to defaults
      container.querySelector("#btn-perm-reset")?.addEventListener("click", async () => {
        const confirmed = await window.HotelDialogs?.confirm({
          title: `Reset ${roleObj.label} permissions?`,
          text: "This will revert the permissions for this role to the recommended system defaults.",
          confirmButtonText: "Reset Defaults",
        });
        if (!confirmed) return;
        renderPermissionsManager(container);
      });

      // Search filter
      const searchInput = container.querySelector("#perm-search");
      searchInput?.addEventListener("input", (e) => {
        const term = e.target.value.trim().toLowerCase();
        container.querySelectorAll(".perm-item").forEach((item) => {
          const text = item.dataset.searchText || "";
          item.style.display = term === "" || text.includes(term) ? "" : "none";
        });
        container.querySelectorAll(".perm-category-block").forEach((cat) => {
          const visibleItems = cat.querySelectorAll('.perm-item:not([style*="display: none"])');
          cat.style.display = visibleItems.length > 0 ? "" : "none";
        });
      });

      // Save handler
      const handleSave = async (btn) => {
        const checkedPerms = Array.from(container.querySelectorAll(".perm-checkbox:checked")).map(
          (cb) => cb.value,
        );
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving…';

        try {
          const res = await window.HotelAuth.request("permissions_save", {
            role: selectedPermRole,
            permissions: checkedPerms,
          });
          notify(res.message || `Permissions for ${roleObj.label} saved successfully.`);

          // If current logged-in role is the one modified, refresh own session
          const curRole = (window.HotelAuth?.getUser()?.role || "").toLowerCase();
          if (curRole === selectedPermRole.toLowerCase()) {
            await window.HotelAuth.refreshSession();
            if (window.HotelModulesHelper?.rebuildSidebar) {
              window.HotelModulesHelper.rebuildSidebar(curRole);
            }
          }
        } catch (err) {
          notify(err.message || "Failed to save permissions.", true);
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        }
      };

      container.querySelector("#btn-perm-save-top")?.addEventListener("click", function () {
        handleSave(this);
      });
      container.querySelector("#btn-perm-save-bottom")?.addEventListener("click", function () {
        handleSave(this);
      });
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger p-3"><i class="bi bi-exclamation-triangle me-2"></i>Failed to load role permissions: ${esc(err.message)}</div>`;
    }
  }

  async function render() {
    const host = $("users-content");
    if (!host) return;

    try {
      const currentUser = window.HotelAuth.getUser();
      const isAdmin = currentUser?.role === "admin";

      const response = await window.HotelAuth.request("users", {}, "GET");
      const usersList = response.users || [];
      const rows = usersList
        .map((user) => {
          const self = Number(user.id) === Number(currentUser?.id);
          const active = Number(user.active) === 1;
          return `
            <tr data-user-id="${Number(user.id)}" data-username="${esc(user.username)}">
              <td><input class="form-control form-control-sm user-username" value="${esc(user.username)}" maxlength="80" aria-label="Username for ${esc(user.username)}" disabled></td>
              <td><select class="form-select form-select-sm user-role" aria-label="Role for ${esc(user.username)}" disabled>${roleOptions(user.role, currentUser?.role)}</select></td>
              <td>
                <select class="form-select form-select-sm user-active" aria-label="Account status for ${esc(user.username)}" disabled>
                  <option value="1" ${active ? "selected" : ""}>Active</option>
                  <option value="0" ${active ? "" : "selected"}>Inactive</option>
                </select>
              </td>
              <td><input class="form-control form-control-sm user-password" type="password" minlength="6" autocomplete="new-password" placeholder="Leave blank to keep unchanged" aria-label="Optional password reset for ${esc(user.username)}" disabled></td>
              <td class="text-nowrap">
                ${
                  self
                    ? '<span class="text-muted small">Current account</span>'
                    : `
                  <button type="button" class="btn btn-sm btn-outline-primary user-edit">Edit</button>
                  <button type="button" class="btn btn-sm btn-primary user-save d-none">Save</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary user-cancel d-none">Cancel</button>
                  <button type="button" class="btn btn-sm btn-outline-danger user-delete">Delete</button>
                `
                }
              </td>
            </tr>`;
        })
        .join("");

      const mobileCards = usersList
        .map((user) => {
          const self = Number(user.id) === Number(currentUser?.id);
          const active = Number(user.active) === 1;
          return `
            <div class="user-card card border-0 shadow-sm p-3 mb-3" data-user-id="${Number(user.id)}" data-username="${esc(user.username)}">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="badge text-bg-${active ? "success" : "secondary"}">${active ? "Active" : "Inactive"}</span>
                ${self ? '<span class="text-muted small">You</span>' : ""}
              </div>
              <div class="mb-2">
                <label class="form-label small text-muted mb-1">Username</label>
                <input class="form-control form-control-sm user-username" value="${esc(user.username)}" maxlength="80" disabled>
              </div>
              <div class="mb-2">
                <label class="form-label small text-muted mb-1">Role</label>
                <select class="form-select form-select-sm user-role" disabled>${roleOptions(user.role, currentUser?.role)}</select>
              </div>
              <div class="mb-2">
                <label class="form-label small text-muted mb-1">Status</label>
                <select class="form-select form-select-sm user-active" disabled>
                  <option value="1" ${active ? "selected" : ""}>Active</option>
                  <option value="0" ${active ? "" : "selected"}>Inactive</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label small text-muted mb-1">Password reset</label>
                <input class="form-control form-control-sm user-password" type="password" minlength="6" autocomplete="new-password" placeholder="Leave blank to keep" disabled>
              </div>
              ${
                self
                  ? '<div class="text-muted small">Current signed-in account</div>'
                  : `
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-sm btn-outline-primary user-edit w-50">Edit</button>
                  <button type="button" class="btn btn-sm btn-primary user-save d-none w-50">Save</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary user-cancel d-none w-50">Cancel</button>
                  <button type="button" class="btn btn-sm btn-outline-danger user-delete w-50">Delete</button>
                </div>
              `
              }
            </div>`;
        })
        .join("");

      // Header navigation tabs (Only Admin sees Role Permissions tab)
      const navTabs = isAdmin
        ? `
          <ul class="nav nav-pills mb-4" id="users-nav-tabs" role="tablist">
            <li class="nav-item">
              <button class="nav-link ${activeTab === "accounts" ? "active" : ""}" id="tab-btn-accounts" type="button">
                <i class="bi bi-people me-1"></i> Staff Accounts
              </button>
            </li>
            <li class="nav-item">
              <button class="nav-link ${activeTab === "permissions" ? "active" : ""}" id="tab-btn-permissions" type="button">
                <i class="bi bi-shield-check me-1"></i> Role Permissions Management
              </button>
            </li>
          </ul>
        `
        : "";

      host.innerHTML = `
        ${navTabs}
        <div id="pane-accounts-container" class="${activeTab === "accounts" ? "" : "d-none"}">
          <section class="card border-0 shadow-sm mb-4">
            <div class="card-body">
              <h5 class="fw-bold">Create staff account</h5>
              <p class="text-muted small">All accounts use bcrypt hashing. Roles enforce departmental access control.</p>
              <form id="user-create-form" class="row g-3">
                <div class="col-md-3">
                  <label class="form-label" for="new-user-username">Username</label>
                  <input id="new-user-username" class="form-control" name="username" maxlength="80" autocomplete="off" required>
                </div>
                <div class="col-md-3">
                  <label class="form-label" for="new-user-role">Role</label>
                  <select id="new-user-role" class="form-select" name="role" required>
                    ${roleOptions("service", currentUser?.role)}
                    <option value="__custom__">+ Custom role…</option>
                  </select>
                  <input id="new-user-custom-role" class="form-control mt-2 d-none" name="custom_role" placeholder="Enter custom role name" maxlength="50">
                </div>
                <div class="col-md-4">
                  <label class="form-label" for="new-user-password">Temporary password (minimum 6 characters)</label>
                  <input id="new-user-password" class="form-control" name="password" type="password" minlength="6" autocomplete="new-password" required>
                </div>
                <div class="col-md-2 d-flex align-items-end">
                  <button class="btn btn-primary w-100">Create account</button>
                </div>
              </form>
            </div>
          </section>
          <section class="card border-0 shadow-sm">
            <div class="card-body">
              <h5 class="fw-bold">Staff accounts</h5>
              <p class="text-muted small">Delete deactivates the account to preserve billing and audit history.</p>
              <div class="table-responsive d-none d-md-block">
                <table class="table align-middle mb-0" style="min-width: 650px;">
                  <thead>
                    <tr>
                      <th style="min-width: 140px;">Username</th>
                      <th style="min-width: 130px;">Role</th>
                      <th style="min-width: 110px;">Status</th>
                      <th style="min-width: 160px;">Password reset</th>
                      <th style="min-width: 120px;">Actions</th>
                    </tr>
                  </thead>
                  <tbody>${rows || '<tr><td colspan="5" class="text-center">No accounts found.</td></tr>'}</tbody>
                </table>
              </div>
              <div class="d-md-none">
                ${mobileCards}
              </div>
            </div>
          </section>
        </div>
        <div id="pane-permissions-container" class="${activeTab === "permissions" ? "" : "d-none"}">
          <!-- Filled by renderPermissionsManager -->
        </div>
      `;

      // Tab switcher handlers
      if (isAdmin) {
        const btnAccounts = host.querySelector("#tab-btn-accounts");
        const btnPermissions = host.querySelector("#tab-btn-permissions");
        const paneAccounts = host.querySelector("#pane-accounts-container");
        const panePermissions = host.querySelector("#pane-permissions-container");

        btnAccounts?.addEventListener("click", () => {
          activeTab = "accounts";
          btnAccounts.classList.add("active");
          btnPermissions.classList.remove("active");
          paneAccounts.classList.remove("d-none");
          panePermissions.classList.add("d-none");
        });

        btnPermissions?.addEventListener("click", () => {
          activeTab = "permissions";
          btnPermissions.classList.add("active");
          btnAccounts.classList.remove("active");
          panePermissions.classList.remove("d-none");
          paneAccounts.classList.add("d-none");
          renderPermissionsManager(panePermissions);
        });

        if (activeTab === "permissions") {
          renderPermissionsManager(panePermissions);
        }
      }

      // Role select custom option handler
      const roleSelect = host.querySelector("#new-user-role");
      const customRoleInput = host.querySelector("#new-user-custom-role");
      if (roleSelect && customRoleInput) {
        roleSelect.addEventListener("change", () => {
          if (roleSelect.value === "__custom__") {
            customRoleInput.classList.remove("d-none");
            customRoleInput.required = true;
            customRoleInput.focus();
          } else {
            customRoleInput.classList.add("d-none");
            customRoleInput.required = false;
          }
        });
      }

      // Create account form handler
      host.querySelector("#user-create-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          const fields = Object.fromEntries(new FormData(event.currentTarget));
          if (fields.role === "__custom__") {
            fields.role = (fields.custom_role || "").trim().toLowerCase();
            delete fields.custom_role;
          }
          await window.HotelAuth.request("user_save", fields);
          notify("Staff account created.");
          await render();
        } catch (error) {
          notify(error.message, true);
        }
      });

      // Edit / Save / Cancel / Delete handlers
      host.querySelectorAll(".user-edit").forEach((button) => {
        button.addEventListener("click", () => {
          const row = button.closest("tr, .user-card");
          row.querySelectorAll(".user-username, .user-role, .user-active, .user-password").forEach((field) => {
            field.disabled = false;
          });
          button.classList.add("d-none");
          row.querySelector(".user-save")?.classList.remove("d-none");
          row.querySelector(".user-cancel")?.classList.remove("d-none");
          row.querySelector(".user-username")?.focus();
        });
      });

      host.querySelectorAll(".user-cancel").forEach((button) => {
        button.addEventListener("click", () => render());
      });

      host.querySelectorAll(".user-save").forEach((button) => {
        button.addEventListener("click", async () => {
          const row = button.closest("tr, .user-card");
          try {
            const password = row.querySelector(".user-password").value;
            if (password && password.length < 6) {
              notify("Password reset must be at least 6 characters.", true);
              return;
            }
            await window.HotelAuth.request("user_save", {
              id: Number(row.dataset.userId),
              username: row.querySelector(".user-username").value.trim(),
              role: row.querySelector(".user-role").value,
              active: Number(row.querySelector(".user-active").value),
              password,
            });
            notify("Staff account updated.");
            await render();
          } catch (error) {
            notify(error.message, true);
          }
        });
      });

      host.querySelectorAll(".user-delete").forEach((button) => {
        button.addEventListener("click", async () => {
          const row = button.closest("tr, .user-card");
          const username = row.dataset.username;
          const confirmed = await window.HotelDialogs.confirm({
            title: "Deactivate staff account?",
            text: `The "${username}" account will be deactivated; historical billing and audit records will be kept.`,
            confirmButtonText: "Deactivate",
          });
          if (!confirmed) return;
          try {
            await window.HotelAuth.request("user_deactivate", {
              id: Number(row.dataset.userId),
            });
            notify("Staff account deactivated.");
            await render();
          } catch (error) {
            notify(error.message, true);
          }
        });
      });
    } catch (error) {
      host.innerHTML = `<div class="alert alert-danger" role="alert">${esc(error.message || "Unable to load staff accounts.")}</div>`;
    }
  }

  window.HotelUsers = { render };
})();

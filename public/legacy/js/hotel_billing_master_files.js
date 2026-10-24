/* Master navigation for the Shesh Dev Hotel dashboard. */
(() => {
  const modules = [
    ["dashboard", "grid-1x2", "Dashboard", "Operations overview"],
    ["walkin-checkin", "person-plus", "Walk-In & Check-In", "Walk-in guest registration and check-in"],
    ["active-stays", "people", "Active Stays", "Current in-house stays and folios"],
    ["checkout", "box-arrow-right", "Check-Out", "Manage guest departures and check-out verification"],
    ["early-checkout-requests", "clock-history", "Early Checkout Requests", "View and submit early departure requests"],
    ["rooms", "door-open", "Rooms & Availability", "Room inventory and housekeeping status"],
    ["catalog", "list-check", "Room Types & Service Menu", "Manage room rates and service prices"],
    ["payments", "cash-coin", "Payments", "Payment records and receipts"],
    ["discount-approvals", "check2-square", "Discount Approvals", "Review pending manager discounts"],
    ["early-checkouts", "clipboard-check", "Early Checkout Approvals", "Review early checkout requests"],
    ["service-requests", "bell", "Guest Service Requests", "Review and update guest requests"],
    ["reports", "bar-chart", "Reports", "Authorized financial reports"],
    ["dept-reports", "graph-up-arrow", "Department Reports", "Daily, weekly and monthly order analytics"],
    ["dept-inventory", "boxes", "Inventory & Stocks", "Department supplies and inventory tracking"],
    ["audit-logs", "shield-check", "Audit Logs", "Staff actions and security trail"],
    ["users", "people-fill", "Staff Accounts", "Manage staff accounts and roles"],
    ["settings", "gear", "Settings", "Account settings"],
  ];

  const serviceRoleModules = ["dashboard", "service-requests", "dept-reports", "dept-inventory", "settings"];
  const restaurantRoleModules = ["dashboard", "service-requests", "catalog", "dept-reports", "dept-inventory", "settings"];
  const barRoleModules = ["dashboard", "service-requests", "catalog", "dept-reports", "dept-inventory", "settings"];
  const maintenanceRoleModules = ["dashboard", "service-requests", "dept-reports", "dept-inventory", "rooms", "settings"];
  const housekeepingRoleModules = ["dashboard", "service-requests", "dept-reports", "dept-inventory", "rooms", "settings"];

  const visibleModules = {
    admin: modules.map(([id]) => id),
    manager: [
      "dashboard",
      "active-stays",
      "rooms",
      "catalog",
      "payments",
      "discount-approvals",
      "early-checkouts",
      "reports",
      "dept-reports",
      "dept-inventory",
      "audit-logs",
      "users",
      "settings",
    ],
    frontdesk: [
      "dashboard",
      "walkin-checkin",
      "active-stays",
      "checkout",
      "early-checkout-requests",
      "rooms",
      
    ],
    cashier: [
      "dashboard",
      "active-stays",
      "payments",
    ],
    service: serviceRoleModules,
    housekeeping: housekeepingRoleModules,
    bar: barRoleModules,
    minibar: barRoleModules,
    restaurant: restaurantRoleModules,
    food_beverage: restaurantRoleModules,
    laundry: serviceRoleModules,
    maintenance: maintenanceRoleModules,
    other: serviceRoleModules,
  };

  window.HotelModules = modules;

  window.HotelModulesHelper = {
    getAllowedModules(role) {
      const curUser = window.HotelAuth?.getUser();
      const r = (role || curUser?.role || "").toLowerCase();
      if (curUser && curUser.role && curUser.role.toLowerCase() === r && Array.isArray(curUser.allowed_modules) && curUser.allowed_modules.length > 0) {
        return new Set(curUser.allowed_modules);
      }
      return new Set(visibleModules[r] || serviceRoleModules);
    },
    isAllowed(role, moduleId) {
      return this.getAllowedModules(role).has(moduleId);
    },
    rebuildSidebar(targetRole) {
      const user = window.HotelAuth?.getUser();
      const role = (targetRole || user?.role || "").toLowerCase();
      const nav = document.getElementById("sidebar-nav");
      if (!nav) return;
      const allowed = this.getAllowedModules(role);
      const visible = modules
        .filter(([id]) => allowed.has(id))
        .map(([id]) => this.getModuleInfo(role, id));

      const itemHtml = ([id, icon, title, description]) => `
            <button type="button" class="sidebar-item text-start border-0 bg-transparent w-100" data-module="${id}" title="${description}">
              <span class="sidebar-icon-wrap">
                <i class="bi bi-${icon}"></i>
                ${
                  id === "service-requests"
                    ? '<span class="request-count-badge d-none" data-request-badge aria-label="Open request count">0</span>'
                    : ""
                }
              </span>
              <span>${title}</span>
            </button>
          `;
      const GROUPS = [
        ["Operations", ["dashboard", "walkin-checkin", "active-stays", "checkout", "early-checkout-requests", "rooms", "service-requests"]],
        ["Billing", ["catalog", "payments", "discount-approvals", "early-checkouts", "reports"]],
        ["Admin", ["audit-logs", "users", "settings"]],
      ];
      const byId = new Map(visible.map((v) => [v[0], v]));
      const placed = new Set();
      let navHtml = "";
      for (const [groupName, ids] of GROUPS) {
        const items = ids.filter((id) => byId.has(id));
        if (!items.length) continue;
        navHtml += `<div class="sidebar-heading">${groupName}</div>`;
        navHtml += items
          .map((id) => {
            placed.add(id);
            return itemHtml(byId.get(id));
          })
          .join("");
      }
      const rest = visible.filter(([id]) => !placed.has(id));
      if (rest.length) {
        navHtml += `<div class="sidebar-heading">Navigation</div>` + rest.map(itemHtml).join("");
      }
      nav.innerHTML = navHtml;

      nav
        .querySelectorAll("[data-module]")
        .forEach((button) =>
          button.addEventListener("click", () =>
            window.HotelBilling?.open(button.dataset.module),
          ),
        );

      const currentActive = window.HotelBilling?.getActiveModule?.();
      if (currentActive && !allowed.has(currentActive)) {
        const fallback = allowed.has("dashboard")
          ? "dashboard"
          : allowed.has("service-requests")
            ? "service-requests"
            : (allowed.has("rooms") ? "rooms" : ([...allowed][0] || "settings"));
        window.HotelBilling?.open(fallback);
      } else if (currentActive) {
        nav.querySelectorAll("[data-module]").forEach(b => b.classList.toggle("active", b.dataset.module === currentActive));
      }
    },
    getModuleInfo(role, moduleId) {
      const r = (role || "").toLowerCase();
      const mod = modules.find(([id]) => id === moduleId);
      if (!mod) return null;
      let [id, icon, title, description] = mod;

      if (id === "service-requests") {
        if (r === "maintenance") {
          title = "Maintenance Requests";
          description = "Review and update maintenance tasks & repair requests";
          icon = "tools";
        } else if (r === "housekeeping") {
          title = "Housekeeping Requests";
          description = "Cleaning and linen fulfillment tasks";
          icon = "brush";
        } else if (r === "restaurant" || r === "food_beverage") {
          title = "Dining & Food Orders";
          description = "Restaurant order fulfillment queue";
          icon = "cup-hot";
        } else if (r === "bar") {
          title = "Bar & Drink Orders";
          description = "Bar and beverage orders queue";
          icon = "cup-straw";
        } else if (r === "laundry") {
          title = "Laundry Orders";
          description = "Laundry and wash fulfillment tasks";
          icon = "water";
        } else if (r === "frontdesk") {
          title = "Guest Service Requests";
          description = "Monitor incoming guest service requests and view task history";
          icon = "bell";
        }
      } else if (id === "rooms" && r === "maintenance") {
        title = "Room Status Board";
        description = "Room conditions and maintenance monitor";
        icon = "door-open";
      } else if (id === "rooms" && r === "housekeeping") {
        title = "Room Cleaning Board";
        description = "Room cleaning status and room monitor";
        icon = "door-open";
      }
      if (id === "catalog") {
        if (r === "restaurant" || r === "food_beverage") {
          title = "Food & Drink Menu";
          description = "Manage food and beverage categories, items, and pricing";
          icon = "cup-hot";
        } else if (r === "bar" || r === "minibar") {
          title = "Bar Menu & Drinks";
          description = "Manage cocktail, wine, and beer categories, items, and pricing";
          icon = "cup-straw";
        }
      } else if (id === "dept-reports") {
        const deptNames = {
          restaurant: "Restaurant Reports",
          food_beverage: "Restaurant Reports",
          bar: "Bar Reports",
          minibar: "Bar Reports",
          housekeeping: "Housekeeping Reports",
          maintenance: "Maintenance Reports",
          laundry: "Laundry Reports",
          service: "Room Service Reports"
        };
        if (deptNames[r]) {
          title = deptNames[r];
          description = "Daily, weekly, and monthly service and sales analytics";
        }
      } else if (id === "dept-inventory") {
        const invNames = {
          restaurant: "Food & Kitchen Inventory",
          food_beverage: "Food & Kitchen Inventory",
          bar: "Bar & Drinks Inventory",
          minibar: "Bar & Drinks Inventory",
          housekeeping: "Housekeeping Supplies",
          maintenance: "Facility Parts & Supplies",
          laundry: "Laundry Supplies",
          service: "Room Service Supplies"
        };
        if (invNames[r]) {
          title = invNames[r];
          description = "Stock tracking, unit costs, and reorder alerts";
        }
      }

      return [id, icon, title, description];
    }
  };

  window.HotelRequestBadge = {
    set(count) {
      document.querySelectorAll("[data-request-badge]").forEach((element) => {
        const value = Math.max(0, Number(count) || 0);
        element.textContent = value > 99 ? "99+" : String(value);
        element.classList.toggle("d-none", value === 0);
      });
    },
  };

  document.addEventListener("hotel:authenticated", (event) => {
    const role = (event.detail?.user?.role || "").toLowerCase();
    window.HotelModulesHelper.rebuildSidebar(role);

    const allowed = window.HotelModulesHelper.getAllowedModules(role);
    const defaultModule = allowed.has("dashboard")
      ? "dashboard"
      : allowed.has("service-requests")
        ? "service-requests"
        : (allowed.has("rooms") ? "rooms" : ([...allowed][0] || "settings"));

    window.HotelBilling?.open(defaultModule);
  });
})();

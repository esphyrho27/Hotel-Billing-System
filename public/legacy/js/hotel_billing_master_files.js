/* Master navigation for the Shesh Dev Hotel dashboard. */
(() => {
  const modules = [
    ["dashboard", "grid-1x2", "Dashboard", "Operations overview"],
    ["walkin-checkin", "person-plus", "Walk-In & Check-In", "Walk-in guest registration and check-in"],
    ["group-checkin", "people-fill", "Group Check-In", "Check in multiple rooms for a group arriving together"],
    ["active-stays", "people", "Active Stays", "Current in-house stays and folios"],
    ["checkout-history", "journal-check", "Checked-Out Guests", "Search completed guest stays and checkout records"],
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
  const generalServiceRoleModules = ["dashboard", "service-requests", "settings"];
  const restaurantRoleModules = ["dashboard", "service-requests", "catalog", "settings"];
  const barRoleModules = ["dashboard", "service-requests", "settings"];
  const departmentRoleModules = {
    bar: barRoleModules,
    bartender: barRoleModules,
    minibar: barRoleModules,
    restaurant: restaurantRoleModules,
    foodbeverage: restaurantRoleModules,
    food: restaurantRoleModules,
  };
  const maintenanceRoleModules = ["dashboard", "service-requests", "rooms", "settings"];
  const housekeepingRoleModules = ["dashboard", "service-requests", "dept-reports", "dept-inventory", "rooms", "settings"];
  const cashierRoleModules = ["dashboard", "payments"];

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
      "service-requests",
      "reports",
      "dept-reports",
      "dept-inventory",
      "audit-logs",
      "users",
      "settings",
    ],
    frontdesk: [
      "dashboard",
      "service-requests",
      "walkin-checkin",
      "group-checkin",
      "active-stays",
      "checkout-history",
      "checkout",
      "early-checkout-requests",
      "rooms",
      
    ],
    cashier: [
      "dashboard",
      "payments",
    ],
    service: generalServiceRoleModules,
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
      const roleKey = r.replace(/[&\s_-]/g, "");
      if (curUser && curUser.role && curUser.role.toLowerCase() === r && Array.isArray(curUser.allowed_modules) && curUser.allowed_modules.length > 0) {
        const allowed = new Set(curUser.allowed_modules);
        const roleModules = {
          cashier: cashierRoleModules,
          service: generalServiceRoleModules,
          maintenance: maintenanceRoleModules,
        }[roleKey];
        const restrictedModules = roleModules || departmentRoleModules[roleKey];
        if (restrictedModules) {
          for (const moduleId of [...allowed]) {
            if (!restrictedModules.includes(moduleId)) allowed.delete(moduleId);
          }
        }
        const permissions = curUser.permissions || [];
        if (["admin", "manager", "frontdesk"].includes(r) && (permissions.includes("*") || permissions.includes("stays.checkin"))) {
          allowed.add("group-checkin");
        }
        if (roleKey === "frontdesk" && (permissions.includes("*") || permissions.includes("service_requests.view"))) {
          allowed.add("service-requests");
        }
        if (["bar", "bartender", "minibar", "restaurant", "foodbeverage", "food"].includes(roleKey)
          && (permissions.includes("*") || permissions.includes("service_requests.view"))) {
          allowed.add("service-requests");
        }
        return allowed;
      }
      return new Set(departmentRoleModules[roleKey] || visibleModules[r] || visibleModules[roleKey] || serviceRoleModules);
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
      const roleKey = role.replace(/[&\s_-]/g, "");
      const GROUPS = roleKey === "cashier"
        ? [["Cashier", ["dashboard", "payments"]]]
        : ["bar", "bartender", "minibar"].includes(roleKey)
          ? [["Bar Operations", ["dashboard", "service-requests"]], ["Account", ["settings"]]]
          : ["restaurant", "foodbeverage", "food"].includes(roleKey)
            ? [["Dining Operations", ["dashboard", "service-requests"]], ["Restaurant Menu", ["catalog"]], ["Account", ["settings"]]]
        : [
            ["Operations", ["dashboard", "walkin-checkin", "group-checkin", "active-stays", "checkout-history", "checkout", "early-checkout-requests", "rooms", "service-requests"]],
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
          button.addEventListener("click", () => {
            if (button.dataset.module === "group-checkin") {
              const openGroupCheckin = () => {
                if (typeof window.HotelGroupCheckin?.open === "function") {
                  window.HotelGroupCheckin.open();
                  return;
                }
                const message = "Group Check-In could not initialize. Reload the page and check that hotel_billing_group_checkin.js loads successfully.";
                console.error("[HotelBilling] " + message);
                if (window.HotelBilling?.notify) window.HotelBilling.notify(message, true);
                else window.alert(message);
              };

              if (typeof window.HotelGroupCheckin?.open === "function") {
                openGroupCheckin();
                return;
              }

              // Recover if the group-check-in script was missed or returned 404 on initial page load.
              const masterScript = Array.from(document.scripts).find((s) => /hotel_billing_master_files\.js(?:\?|$)/.test(s.src));
              if (!masterScript) {
                openGroupCheckin();
                return;
              }
              const loader = document.createElement("script");
              loader.src = new URL("hotel_billing_group_checkin.js?v=20261029_5", masterScript.src).href;
              loader.onload = openGroupCheckin;
              loader.onerror = () => {
                console.error("[HotelBilling] Failed to load group check-in script:", loader.src);
                openGroupCheckin();
              };
              document.head.appendChild(loader);
              return;
            }
            window.HotelBilling?.open(button.dataset.module);
          }),
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
      const roleKey = r.replace(/[&\s_-]/g, "");
      const mod = modules.find(([id]) => id === moduleId);
      if (!mod) return null;
      let [id, icon, title, description] = mod;

      if (id === "dashboard" && ["bar", "bartender", "minibar"].includes(r.replace(/[&\s_-]/g, ""))) {
        title = "Bar & Drink Orders";
        description = "Prepare drink tickets and manage bar service";
        icon = "cup-straw";
      } else if (id === "dashboard" && ["restaurant", "foodbeverage", "food"].includes(r.replace(/[&\s_-]/g, ""))) {
        title = "Restaurant Orders";
        description = "Manage the restaurant order queue and menu";
        icon = "cup-hot";
      }

      if (r === "cashier") {
        if (id === "dashboard") {
          title = "Cashier Overview";
          description = "Payment activity and cashier work queue";
          icon = "speedometer2";
        } else if (id === "payments") {
          title = "Payment Desk";
          description = "Check-in collections, open folios, payments, and receipts";
          icon = "cash-register";
        }
      }

      if (id === "service-requests") {
        if (roleKey === "maintenance") {
          title = "Maintenance Work Orders";
          description = "Repair tasks and safety issues assigned to Maintenance";
          icon = "tools";
        } else if (roleKey === "service") {
          title = "Guest Services Requests";
          description = "General guest assistance assigned to Guest Services";
          icon = "headset";
        } else if (roleKey === "housekeeping") {
          title = "Housekeeping Requests";
          description = "Cleaning and linen fulfillment tasks";
          icon = "brush";
        } else if (["restaurant", "foodbeverage", "food"].includes(roleKey)) {
          title = "Dining & Food Orders";
          description = "Restaurant order fulfillment queue";
          icon = "cup-hot";
        } else if (["bar", "bartender", "minibar"].includes(roleKey)) {
          title = "Bar Guest Requests";
          description = "Guest service requests assigned to the Bar";
          icon = "bell";
        } else if (roleKey === "laundry") {
          title = "Laundry Orders";
          description = "Laundry and wash fulfillment tasks";
          icon = "water";
        } else if (roleKey === "frontdesk") {
          title = "Guest Service Requests";
          description = "Monitor incoming guest service requests and view task history";
          icon = "bell";
        }
      } else if (id === "rooms" && roleKey === "maintenance") {
        title = "Room Status Board";
        description = "Room conditions and maintenance monitor";
        icon = "door-open";
      } else if (id === "rooms" && roleKey === "housekeeping") {
        title = "Room Cleaning Board";
        description = "Room cleaning status and room monitor";
        icon = "door-open";
      }
      if (id === "catalog") {
        if (["restaurant", "foodbeverage", "food"].includes(roleKey)) {
          title = "Restaurant Menu";
          description = "Manage food and beverage categories, items, and pricing";
          icon = "cup-hot";
        } else if (["bar", "bartender", "minibar"].includes(roleKey)) {
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

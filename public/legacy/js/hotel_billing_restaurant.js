/**
 * Hotel Billing System - Restaurant Dashboard & Menu Management Module
 * Comprehensive restaurant operations, menu management (Food & Drinks),
 * real-time customer order processing, and analytics integration.
 */
(() => {
  'use strict';

  const esc = (t) => {
    const d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  };

  const php = (n) => '₱' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getCurRole = () => (window.HotelAuth?.getUser()?.role || '').toLowerCase();

  const api = (...args) => {
    if (window.HotelBilling && typeof window.HotelBilling.api === 'function') {
      return window.HotelBilling.api(...args);
    }
    if (window.HotelAuth && typeof window.HotelAuth.request === 'function') {
      return window.HotelAuth.request(...args);
    }
    throw new Error('API client not available');
  };

  // Full management permissions on the Restaurant Dashboard
  const canManageMenu = () => true;
let activeMenuType = 'Food'; // 'Food' or 'Drinks'
  let activeCategoryFilter = '';
  let activeSearchTerm = '';
  let activeAvailabilityFilter = 'all'; // 'all', 'Available', 'Unavailable'
  let cachedCategories = [];
  let cachedItems = [];
  let cachedOrders = [];
  let activeOrdersFilter = 'all'; // 'all', 'active', 'completed', 'cancelled'
  let cachedStats = null;
  let activeTab = 'menu'; // 'menu', 'orders'

  /**
   * Main render function for Restaurant Dashboard
   */
  async function renderDashboard() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    container.innerHTML = `
      <div class="text-center py-5 text-muted">
        <div class="spinner-border spinner-border-sm text-dark mb-3" role="status"></div>
        <div>Loading Restaurant Dashboard & Menu...</div>
      </div>
    `;

    try {
      // Fetch stats and initial data
      const [statsRes, menuRes, ordersRes] = await Promise.all([
        api('restaurant_dashboard_stats', {}, 'GET'),
        api('restaurant_menu_list', {}, 'GET'),
        api('restaurant_orders_list', {}, 'GET')
      ]);

      cachedStats = statsRes.stats || {};
      cachedCategories = menuRes.categories || [];
      cachedItems = menuRes.items || [];
      cachedOrders = ordersRes.orders || [];

      renderFullDashboard();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger shadow-sm">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>Failed to load restaurant dashboard: ${esc(err.message)}
        </div>
      `;
    }
  }

  /**
   * Render HTML structure of the Restaurant Dashboard
   */
  function renderFullDashboard() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    const stats = cachedStats || {};
    const curRole = getCurRole();
    const canEdit = true;
// Summary Cards (The exact 6 required statistics)
    const summaryCardsHtml = `
      <div class="row g-2 g-sm-3 mb-4">
        <div class="col-6 col-md-4 col-xl-2">
          <div class="card border-0 shadow-sm h-100 dashboard-stat">
            <div class="card-body p-2 p-sm-3 d-flex align-items-center gap-2 gap-sm-3">
              <div class="dashboard-stat-icon text-dark"><i class="bi bi-book"></i></div>
              <div class="min-w-0 flex-grow-1">
                <div class="text-muted small text-truncate dashboard-stat-label">Total Menu Items</div>
                <div class="dashboard-stat-value text-dark" id="stat-total-items">${stats.total_menu_items || 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-xl-2">
          <div class="card border-0 shadow-sm h-100 dashboard-stat">
            <div class="card-body p-2 p-sm-3 d-flex align-items-center gap-2 gap-sm-3">
              <div class="dashboard-stat-icon text-success"><i class="bi bi-check-circle"></i></div>
              <div class="min-w-0 flex-grow-1">
                <div class="text-muted small text-truncate dashboard-stat-label">Available Items</div>
                <div class="dashboard-stat-value text-success" id="stat-avail-items">${stats.available_items || 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-xl-2">
          <div class="card border-0 shadow-sm h-100 dashboard-stat">
            <div class="card-body p-2 p-sm-3 d-flex align-items-center gap-2 gap-sm-3">
              <div class="dashboard-stat-icon text-secondary"><i class="bi bi-dash-circle"></i></div>
              <div class="min-w-0 flex-grow-1">
                <div class="text-muted small text-truncate dashboard-stat-label">Unavailable Items</div>
                <div class="dashboard-stat-value text-secondary" id="stat-unavail-items">${stats.unavailable_items || 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-xl-2">
          <div class="card border-0 shadow-sm h-100 dashboard-stat">
            <div class="card-body p-2 p-sm-3 d-flex align-items-center gap-2 gap-sm-3">
              <div class="dashboard-stat-icon text-primary"><i class="bi bi-bag-check"></i></div>
              <div class="min-w-0 flex-grow-1">
                <div class="text-muted small text-truncate dashboard-stat-label">Total Orders</div>
                <div class="dashboard-stat-value text-primary" id="stat-total-orders">${stats.total_orders || 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-xl-2">
          <div class="card border-0 shadow-sm h-100 dashboard-stat">
            <div class="card-body p-2 p-sm-3 d-flex align-items-center gap-2 gap-sm-3">
              <div class="dashboard-stat-icon text-warning"><i class="bi bi-hourglass-split"></i></div>
              <div class="min-w-0 flex-grow-1">
                <div class="text-muted small text-truncate dashboard-stat-label">Pending Orders</div>
                <div class="dashboard-stat-value text-warning" id="stat-pending-orders">${stats.pending_orders || 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-xl-2">
          <div class="card border-0 shadow-sm h-100 dashboard-stat">
            <div class="card-body p-2 p-sm-3 d-flex align-items-center gap-2 gap-sm-3">
              <div class="dashboard-stat-icon text-success"><i class="bi bi-check2-all"></i></div>
              <div class="min-w-0 flex-grow-1">
                <div class="text-muted small text-truncate dashboard-stat-label">Completed Orders</div>
                <div class="dashboard-stat-value text-success" id="stat-completed-orders">${stats.completed_orders || 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Role Notice if Admin / Manager (they can view, but cannot edit menu items)
    let roleNoticeHtml = '';

    // Top action bar & navigation tabs
    const navigationHtml = `
      <div class="card border-0 shadow-sm mb-3">
        <div class="card-body p-3">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
            <div class="nav nav-pills" id="restaurant-main-tabs" role="tablist">
              <button class="nav-link ${activeTab === 'menu' ? 'active' : ''} fw-semibold px-3 py-2" type="button" onclick="HotelRestaurantDashboard.switchTab('menu')">
                <i class="bi bi-journal-text me-1"></i>Menu Management
              </button>
              <button class="nav-link ${activeTab === 'orders' ? 'active' : ''} fw-semibold px-3 py-2 position-relative" type="button" onclick="HotelRestaurantDashboard.switchTab('orders')">
                <i class="bi bi-receipt me-1"></i>Customer Orders Queue
                ${(stats.pending_orders || 0) > 0 ? `<span class="badge rounded-pill text-bg-warning text-dark ms-1" id="tab-pending-badge">${stats.pending_orders}</span>` : ''}
              </button>
            </div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              ${canEdit ? `
                <button class="btn btn-success btn-sm fw-semibold" onclick="HotelRestaurantDashboard.openCreateOrderModal()">
                  <i class="bi bi-cart-plus me-1"></i>Take New Order
                </button>
                <button class="btn btn-outline-dark btn-sm fw-semibold" onclick="HotelRestaurantDashboard.openAddCategoryModal()">
                  <i class="bi bi-tag me-1"></i>+ Category
                </button>
                <button class="btn btn-primary btn-sm fw-semibold" onclick="HotelRestaurantDashboard.openAddItemModal()">
                  <i class="bi bi-plus-lg me-1"></i>+ Add Menu Item
                </button>
              ` : ''}
              <button class="btn btn-outline-secondary btn-sm" onclick="HotelRestaurantDashboard.refreshAll()" title="Refresh Data">
                <i class="bi bi-arrow-clockwise"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = summaryCardsHtml + roleNoticeHtml + navigationHtml + '<div id="restaurant-tab-content"></div>';

    if (activeTab === 'menu') {
      renderMenuManagementTab();
    } else {
      renderOrdersTab();
    }
  }

  /**
   * Render the Menu Management tab (Food vs Drinks, Categories, Items grid/table)
   */
  function renderMenuManagementTab() {
    const container = document.getElementById('restaurant-tab-content');
    if (!container) return;

    // Filter categories by active menu type (Food or Drinks)
    const typeCategories = cachedCategories.filter(c => (c.menu_type || 'Food') === activeMenuType);

    // Filter items by menu type, category, availability, and search
    let filteredItems = cachedItems.filter(i => (i.menu_type || 'Food') === activeMenuType);

    if (activeCategoryFilter) {
      filteredItems = filteredItems.filter(i => String(i.category_id) === String(activeCategoryFilter));
    }

    if (activeAvailabilityFilter !== 'all') {
      filteredItems = filteredItems.filter(i => i.availability_status === activeAvailabilityFilter);
    }

    if (activeSearchTerm) {
      const q = activeSearchTerm.toLowerCase();
      filteredItems = filteredItems.filter(i =>
        (i.item_name || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.category_name || '').toLowerCase().includes(q)
      );
    }

    const foodCount = cachedItems.filter(i => (i.menu_type || 'Food') === 'Food').length;
    const drinksCount = cachedItems.filter(i => (i.menu_type || 'Food') === 'Drinks').length;
    const canEdit = true;
container.innerHTML = `
      <!-- Sub-tabs: Food Menu vs Drinks Menu -->
      <div class="card border-0 shadow-sm mb-3">
        <div class="card-body p-3">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-3 pb-3 border-bottom">
            <div class="btn-group" role="group" aria-label="Menu Type">
              <button type="button" class="btn ${activeMenuType === 'Food' ? 'btn-dark fw-bold' : 'btn-outline-secondary'}" onclick="HotelRestaurantDashboard.switchMenuType('Food')">
                <i class="bi bi-egg-fried me-1"></i>Food Menu <span class="badge text-bg-light text-dark ms-1">${foodCount}</span>
              </button>
              <button type="button" class="btn ${activeMenuType === 'Drinks' ? 'btn-dark fw-bold' : 'btn-outline-secondary'}" onclick="HotelRestaurantDashboard.switchMenuType('Drinks')">
                <i class="bi bi-cup-straw me-1"></i>Drinks Menu <span class="badge text-bg-light text-dark ms-1">${drinksCount}</span>
              </button>
            </div>

            <!-- Search and Availability Filter -->
            <div class="d-flex align-items-center gap-2 flex-grow-1 justify-content-md-end flex-wrap" style="max-width: 600px;">
              <div class="input-group input-group-sm" style="max-width: 280px;">
                <span class="input-group-text bg-light border-end-0"><i class="bi bi-search text-muted"></i></span>
                <input type="text" id="rest-search-input" class="form-control border-start-0" placeholder="Search menu items..." value="${esc(activeSearchTerm)}">
                ${activeSearchTerm ? `<button class="btn btn-outline-secondary" type="button" onclick="HotelRestaurantDashboard.clearSearch()"><i class="bi bi-x"></i></button>` : ''}
              </div>
              <select class="form-select form-select-sm" id="rest-avail-filter" style="width: 140px;" onchange="HotelRestaurantDashboard.filterAvailability(this.value)">
                <option value="all" ${activeAvailabilityFilter === 'all' ? 'selected' : ''}>All Status</option>
                <option value="Available" ${activeAvailabilityFilter === 'Available' ? 'selected' : ''}>Available</option>
                <option value="Unavailable" ${activeAvailabilityFilter === 'Unavailable' ? 'selected' : ''}>Unavailable</option>
              </select>
            </div>
          </div>

          <!-- Category Filter Pills -->
          <div class="d-flex align-items-center gap-1 flex-wrap pt-3 overflow-x-auto" style="white-space: nowrap;">
            <span class="small fw-bold text-muted me-2"><i class="bi bi-funnel me-1"></i>Categories:</span>
            <button class="btn btn-sm ${!activeCategoryFilter ? 'btn-primary' : 'btn-light border'} rounded-pill px-3 py-1 mb-1" onclick="HotelRestaurantDashboard.filterCategory('')">
              All (${activeMenuType === 'Food' ? foodCount : drinksCount})
            </button>
            ${typeCategories.map(cat => {
              const catItemCount = cachedItems.filter(i => String(i.category_id) === String(cat.id)).length;
              const isSelected = String(activeCategoryFilter) === String(cat.id);
              return `
                <button class="btn btn-sm ${isSelected ? 'btn-primary' : 'btn-light border'} rounded-pill px-3 py-1 mb-1" onclick="HotelRestaurantDashboard.filterCategory('${cat.id}')">
                  ${esc(cat.category_name)} <span class="badge ${isSelected ? 'text-bg-light text-primary' : 'text-bg-secondary'} ms-1">${catItemCount}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Items Grid / Table -->
      <div class="card border-0 shadow-sm">
        <div class="card-header bg-white py-3 border-0 d-flex justify-content-between align-items-center">
          <h6 class="fw-bold mb-0 text-dark">
            <i class="bi bi-${activeMenuType === 'Food' ? 'egg-fried' : 'cup-straw'} me-2 text-primary"></i>
            ${activeMenuType} Items (${filteredItems.length})
          </h6>
          <span class="small text-muted">Prices in Philippine Pesos (₱)</span>
        </div>
        <div class="card-body p-0">
          ${filteredItems.length === 0 ? `
            <div class="text-center py-5 text-muted">
              <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
              <div>No menu items found matching the selected filters.</div>
              ${activeSearchTerm || activeCategoryFilter || activeAvailabilityFilter !== 'all' ? `
                <button class="btn btn-outline-primary btn-sm mt-3" onclick="HotelRestaurantDashboard.resetFilters()">
                  Reset Filters
                </button>
              ` : ''}
            </div>
          ` : `
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th style="width: 50px;">#</th>
                    <th>Item Details</th>
                    <th>Category</th>
                    <th>Price (₱)</th>
                    <th>Availability</th>
                    <th class="text-end" style="width: 220px;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredItems.map((item, idx) => {
                    const isAvail = item.availability_status === 'Available';
                    const icon = activeMenuType === 'Food' ? 'egg-fried' : 'cup-hot';
                    return `
                      <tr id="menu-row-${item.id}">
                        <td class="text-muted small">${idx + 1}</td>
                        <td>
                          <div class="d-flex align-items-center gap-3">
                            <div class="rounded-3 bg-light border d-flex align-items-center justify-content-center text-primary" style="width: 44px; height: 44px; flex-shrink: 0; overflow: hidden;">
                              ${item.image_path ? `
                                <img src="${esc(item.image_path)}" alt="${esc(item.item_name)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='<i class=\\'bi bi-${icon}\\'></i>'">
                              ` : `<i class="bi bi-${icon} fs-5"></i>`}
                            </div>
                            <div>
                              <div class="fw-bold text-dark">${esc(item.item_name)}</div>
                              ${item.description ? `<div class="small text-muted text-truncate" style="max-width: 320px;">${esc(item.description)}</div>` : ''}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span class="badge text-bg-light border text-dark fw-semibold px-2 py-1">
                            ${esc(item.category_name || 'General')}
                          </span>
                        </td>
                        <td>
                          <span class="fw-bold text-dark fs-6">${php(item.price)}</span>
                        </td>
                        <td>
                          <span class="badge ${isAvail ? 'text-bg-success' : 'text-bg-secondary'} px-2 py-1" id="badge-avail-${item.id}">
                            <i class="bi bi-${isAvail ? 'check-circle' : 'dash-circle'} me-1"></i>${esc(item.availability_status)}
                          </span>
                        </td>
                        <td class="text-end">
                          <div class="btn-group btn-group-sm" role="group">
                            ${canEdit ? `
                              <button class="btn ${isAvail ? 'btn-outline-secondary' : 'btn-outline-success'} fw-semibold" onclick="HotelRestaurantDashboard.toggleItemAvailability(${item.id})" title="Toggle Availability">
                                <i class="bi bi-${isAvail ? 'toggle-on text-success' : 'toggle-off text-muted'} me-1"></i>${isAvail ? 'Available' : 'Unavailable'}
                              </button>
                              <button class="btn btn-outline-primary fw-semibold" onclick="HotelRestaurantDashboard.openEditItemModal(${item.id})" title="Edit Item">
                                <i class="bi bi-pencil me-1"></i>Edit
                              </button>
                            ` : `
                              <span class="badge text-bg-light text-muted border">Staff Only</span>
                            `}
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;

    // Hook search input listener
    const searchInput = document.getElementById('rest-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        activeSearchTerm = e.target.value.trim();
        renderMenuManagementTab();
      });
    }
  }

  /**
   * Render Customer Orders tab
   */
  function renderOrdersTab() {
    const container = document.getElementById('restaurant-tab-content');
    if (!container) return;

    let orders = cachedOrders;
    if (activeOrdersFilter === 'active') {
      orders = orders.filter(o => ['Pending', 'Confirmed', 'Preparing', 'Ready for Serving'].includes(o.order_status));
    } else if (activeOrdersFilter === 'completed') {
      orders = orders.filter(o => ['Served', 'Completed'].includes(o.order_status));
    } else if (activeOrdersFilter === 'cancelled') {
      orders = orders.filter(o => o.order_status === 'Cancelled');
    }

    const statusBadgeClass = {
      Pending: 'text-bg-warning text-dark',
      Confirmed: 'text-bg-primary',
      Preparing: 'text-bg-info text-dark',
      'Ready for Serving': 'text-bg-cyan text-dark',
      Served: 'text-bg-teal text-white',
      Completed: 'text-bg-success',
      Cancelled: 'text-bg-danger'
    };

    container.innerHTML = `
      <div class="card border-0 shadow-sm mb-3">
        <div class="card-body p-3">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
            <div class="btn-group btn-group-sm" role="group" aria-label="Orders Filter">
              <button type="button" class="btn ${activeOrdersFilter === 'all' ? 'btn-primary fw-semibold' : 'btn-outline-secondary'}" onclick="HotelRestaurantDashboard.filterOrders('all')">
                All Orders (${cachedOrders.length})
              </button>
              <button type="button" class="btn ${activeOrdersFilter === 'active' ? 'btn-primary fw-semibold' : 'btn-outline-secondary'}" onclick="HotelRestaurantDashboard.filterOrders('active')">
                Active / In-Queue (${cachedOrders.filter(o => ['Pending', 'Confirmed', 'Preparing', 'Ready for Serving'].includes(o.order_status)).length})
              </button>
              <button type="button" class="btn ${activeOrdersFilter === 'completed' ? 'btn-primary fw-semibold' : 'btn-outline-secondary'}" onclick="HotelRestaurantDashboard.filterOrders('completed')">
                Completed (${cachedOrders.filter(o => ['Served', 'Completed'].includes(o.order_status)).length})
              </button>
              <button type="button" class="btn ${activeOrdersFilter === 'cancelled' ? 'btn-primary fw-semibold' : 'btn-outline-secondary'}" onclick="HotelRestaurantDashboard.filterOrders('cancelled')">
                Cancelled (${cachedOrders.filter(o => o.order_status === 'Cancelled').length})
              </button>
            </div>
            <button class="btn btn-outline-secondary btn-sm fw-semibold" onclick="HotelRestaurantDashboard.refreshOrders()">
              <i class="bi bi-arrow-clockwise me-1"></i>Refresh Orders
            </button>
          </div>
        </div>
      </div>

      <div class="card border-0 shadow-sm">
        <div class="card-header bg-white py-3 border-0 d-flex justify-content-between align-items-center">
          <h6 class="fw-bold mb-0 text-dark">
            <i class="bi bi-receipt me-2 text-primary"></i>Customer Orders Feed (${orders.length})
          </h6>
          <span class="small text-muted">Sorted by newest first</span>
        </div>
        <div class="card-body p-0">
          ${orders.length === 0 ? `
            <div class="text-center py-5 text-muted">
              <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
              <div>No customer orders found in this view.</div>
            </div>
          ` : `
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Order Code</th>
                    <th>Customer / Destination</th>
                    <th>Order Items</th>
                    <th>Total Amount</th>
                    <th>Payment</th>
                    <th>Order Status</th>
                    <th>Time</th>
                    <th class="text-end" style="min-width: 230px;">Workflow Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${orders.map(order => {
                    const badgeCls = statusBadgeClass[order.order_status] || 'text-bg-secondary';
                    const itemsSummary = (order.items || []).map(i => `${i.quantity}x ${esc(i.item_name)}`).join(', ') || 'No item details';
                    return `
                      <tr id="order-row-${order.id}">
                        <td>
                          <span class="fw-bold font-monospace text-dark">${esc(order.order_code)}</span>
                          <div class="small text-muted">${esc(order.order_type || 'Room Service')}</div>
                        </td>
                        <td>
                          <div class="fw-semibold text-dark">${esc(order.customer_name || 'In-House Guest')}</div>
                          ${order.room_number ? `<span class="badge text-bg-light border text-primary"><i class="bi bi-door-open me-1"></i>Room ${esc(order.room_number)}</span>` : '<span class="badge text-bg-light border text-muted">Restaurant</span>'}
                        </td>
                        <td>
                          <div class="small text-truncate" style="max-width: 280px;" title="${esc(itemsSummary)}">
                            ${itemsSummary}
                          </div>
                          ${order.notes ? `<div class="small text-danger fst-italic text-truncate" style="max-width: 280px;" title="Note: ${esc(order.notes)}"><i class="bi bi-chat-left-text me-1"></i>${esc(order.notes)}</div>` : ''}
                        </td>
                        <td>
                          <span class="fw-bold text-dark">${php(order.total_amount)}</span>
                        </td>
                        <td>
                          ${renderPaymentBadge(order)}
                        </td>
                        <td>
                          <span class="badge ${badgeCls} px-2 py-1" id="order-badge-${order.id}">${esc(order.order_status)}</span>
                        </td>
                        <td class="small text-muted text-nowrap">
                          ${esc(order.created_at)}
                        </td>
                        <td class="text-end">
                          <div class="d-flex align-items-center justify-content-end gap-1 flex-wrap">
                            ${renderOrderActions(order)}
                            <button class="btn btn-outline-secondary btn-sm" onclick="HotelRestaurantDashboard.viewOrderDetails(${order.id})" title="View Details">
                              <i class="bi bi-eye"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;
  }

  /**
   * Action buttons for advancing order statuses
   */
  function renderPaymentBadge(order) {
    const ps = order.payment_status || "Unpaid";
    if (ps === "Paid") {
      return `<span class="badge text-bg-success px-2 py-1"><i class="bi bi-check-circle me-1"></i>Paid (${esc(order.payment_method || "Cash")})</span>`;
    }
    if (ps === "Billed to Room") {
      return `<span class="badge text-bg-info text-dark px-2 py-1"><i class="bi bi-door-open me-1"></i>Billed to Room</span>`;
    }
    return `<span class="badge text-bg-warning text-dark px-2 py-1"><i class="bi bi-exclamation-circle me-1"></i>Unpaid</span>`;
  }

  function renderOrderActions(order) {
    const s = order.order_status;
    const isUnpaid = (order.payment_status === "Unpaid" || !order.payment_status) && s !== "Cancelled";
    const payBtn = isUnpaid ? `
      <button class="btn btn-outline-success btn-sm fw-semibold" onclick="HotelRestaurantDashboard.openSettlePaymentModal(${order.id})" title="Settle Payment">
        <i class="bi bi-cash-coin me-1"></i>Pay
      </button>
    ` : "";
    if (s === 'Pending') {
      return payBtn + `
        <button class="btn btn-primary btn-sm fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Confirmed')">
          <i class="bi bi-check2 me-1"></i>Confirm
        </button>
        <button class="btn btn-outline-danger btn-sm" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Cancelled')" title="Cancel Order">
          <i class="bi bi-x"></i>
        </button>
      `;
    }
    if (s === 'Confirmed') {
      return payBtn + `
        <button class="btn btn-info btn-sm text-dark fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Preparing')">
          <i class="bi bi-fire me-1"></i>Start Prep
        </button>
        <button class="btn btn-outline-danger btn-sm" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Cancelled')" title="Cancel Order">
          <i class="bi bi-x"></i>
        </button>
      `;
    }
    if (s === 'Preparing') {
      return payBtn + `
        <button class="btn btn-warning btn-sm text-dark fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Ready for Serving')">
          <i class="bi bi-bell me-1"></i>Ready
        </button>
      `;
    }
    if (s === 'Ready for Serving') {
      return payBtn + `
        <button class="btn btn-success btn-sm fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Served')">
          <i class="bi bi-cup-hot me-1"></i>Mark Served
        </button>
      `;
    }
    if (s === 'Served') {
      return payBtn + `
        <button class="btn btn-success btn-sm fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Completed')">
          <i class="bi bi-check2-all me-1"></i>Complete
        </button>
      `;
    }
    return '';
  }

  /**
   * Modal to Add a new Menu Item
   */
  function openAddItemModal() {
    

    const typeCategories = cachedCategories.filter(c => (c.menu_type || 'Food') === activeMenuType);

    const modalId = 'modal-add-menu-item';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = modalId;
      modalEl.className = 'modal fade';
      modalEl.tabIndex = -1;
      document.body.appendChild(modalEl);
    }

    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow">
          <div class="modal-header">
            <h6 class="modal-title fw-bold">
              <i class="bi bi-plus-circle me-2 text-primary"></i>Add New ${activeMenuType} Item
            </h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="form-add-menu-item">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label small fw-semibold">Menu Type <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="item-modal-menu-type" onchange="HotelRestaurantDashboard.onModalMenuTypeChange(this.value)" required>
                  <option value="Food" ${activeMenuType === 'Food' ? 'selected' : ''}>Food Menu</option>
                  <option value="Drinks" ${activeMenuType === 'Drinks' ? 'selected' : ''}>Drinks Menu</option>
                </select>
              </div>

              <div class="mb-3">
                <label class="form-label small fw-semibold">Category <span class="text-danger">*</span></label>
                <div class="input-group input-group-sm">
                  <select class="form-select" id="item-modal-category" required>
                    <option value="">-- Select Category --</option>
                    ${typeCategories.map(c => `<option value="${c.id}">${esc(c.category_name)}</option>`).join('')}
                  </select>
                  <button class="btn btn-outline-secondary" type="button" onclick="HotelRestaurantDashboard.openAddCategoryModal(true)">
                    + New
                  </button>
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label small fw-semibold">Item Name <span class="text-danger">*</span></label>
                <input type="text" class="form-control form-control-sm" id="item-modal-name" placeholder="e.g. Crispy Calamari" maxlength="150" required>
              </div>

              <div class="mb-3">
                <label class="form-label small fw-semibold">Description (Optional)</label>
                <textarea class="form-control form-control-sm" id="item-modal-desc" rows="2" placeholder="Brief ingredients or serving description..."></textarea>
              </div>

              <div class="row g-2 mb-3">
                <div class="col-6">
                  <label class="form-label small fw-semibold">Price in ₱ <span class="text-danger">*</span></label>
                  <div class="input-group input-group-sm">
                    <span class="input-group-text">₱</span>
                    <input type="number" step="0.01" min="0" class="form-control" id="item-modal-price" placeholder="0.00" required>
                  </div>
                </div>
                <div class="col-6">
                  <label class="form-label small fw-semibold">Availability Status</label>
                  <select class="form-select form-select-sm" id="item-modal-avail">
                    <option value="Available" selected>Available</option>
                    <option value="Unavailable">Unavailable</option>
                  </select>
                </div>
              </div>

              <div class="mb-2">
                <label class="form-label small fw-semibold">Image URL (Optional)</label>
                <input type="url" class="form-control form-control-sm" id="item-modal-image" placeholder="https://... (or relative path)">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-light btn-sm" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary btn-sm fw-semibold" id="btn-save-menu-item">
                <i class="bi bi-check-lg me-1"></i>Save Menu Item
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    document.getElementById('form-add-menu-item').onsubmit = async (e) => {
      e.preventDefault();
      const catId = document.getElementById('item-modal-category').value;
      const name = document.getElementById('item-modal-name').value.trim();
      const desc = document.getElementById('item-modal-desc').value.trim();
      const price = parseFloat(document.getElementById('item-modal-price').value);
      const avail = document.getElementById('item-modal-avail').value;
      const img = document.getElementById('item-modal-image').value.trim();

      if (!name) return alert('Please enter an item name.');
      if (!catId) return alert('Please select a category.');
      if (isNaN(price) || price < 0) return alert('Please enter a valid price.');

      const saveBtn = document.getElementById('btn-save-menu-item');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

      try {
        await api('restaurant_item_save', {
          category_id: catId,
          item_name: name,
          description: desc,
          price: price,
          availability_status: avail,
          image_path: img
        }, 'POST');

        modal.hide();
        window.HotelDialogs?.toast('Menu item added successfully!');
        await refreshAll();
      } catch (err) {
        alert('Failed to save menu item: ' + err.message);
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Save Menu Item';
      }
    };
  }

  /**
   * Modal to Edit an existing Menu Item
   */
  function openEditItemModal(itemId) {
    

    const item = cachedItems.find(i => Number(i.id) === Number(itemId));
    if (!item) return alert('Item not found.');

    const modalId = 'modal-edit-menu-item';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = modalId;
      modalEl.className = 'modal fade';
      modalEl.tabIndex = -1;
      document.body.appendChild(modalEl);
    }

    const typeCategories = cachedCategories.filter(c => (c.menu_type || 'Food') === (item.menu_type || 'Food'));

    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow">
          <div class="modal-header">
            <h6 class="modal-title fw-bold">
              <i class="bi bi-pencil-square me-2 text-primary"></i>Edit Menu Item
            </h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="form-edit-menu-item">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label small fw-semibold">Category <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="edit-modal-category" required>
                  ${typeCategories.map(c => `<option value="${c.id}" ${String(c.id) === String(item.category_id) ? 'selected' : ''}>${esc(c.category_name)}</option>`).join('')}
                </select>
              </div>

              <div class="mb-3">
                <label class="form-label small fw-semibold">Item Name <span class="text-danger">*</span></label>
                <input type="text" class="form-control form-control-sm" id="edit-modal-name" value="${esc(item.item_name)}" maxlength="150" required>
              </div>

              <div class="mb-3">
                <label class="form-label small fw-semibold">Description</label>
                <textarea class="form-control form-control-sm" id="edit-modal-desc" rows="2">${esc(item.description || '')}</textarea>
              </div>

              <div class="row g-2 mb-3">
                <div class="col-6">
                  <label class="form-label small fw-semibold">Price in ₱ <span class="text-danger">*</span></label>
                  <div class="input-group input-group-sm">
                    <span class="input-group-text">₱</span>
                    <input type="number" step="0.01" min="0" class="form-control" id="edit-modal-price" value="${Number(item.price || 0).toFixed(2)}" required>
                  </div>
                </div>
                <div class="col-6">
                  <label class="form-label small fw-semibold">Availability Status</label>
                  <select class="form-select form-select-sm" id="edit-modal-avail">
                    <option value="Available" ${item.availability_status === 'Available' ? 'selected' : ''}>Available</option>
                    <option value="Unavailable" ${item.availability_status === 'Unavailable' ? 'selected' : ''}>Unavailable</option>
                  </select>
                </div>
              </div>

              <div class="mb-2">
                <label class="form-label small fw-semibold">Image URL (Optional)</label>
                <input type="url" class="form-control form-control-sm" id="edit-modal-image" value="${esc(item.image_path || '')}">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-light btn-sm" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary btn-sm fw-semibold" id="btn-update-menu-item">
                <i class="bi bi-check-lg me-1"></i>Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    document.getElementById('form-edit-menu-item').onsubmit = async (e) => {
      e.preventDefault();
      const catId = document.getElementById('edit-modal-category').value;
      const name = document.getElementById('edit-modal-name').value.trim();
      const desc = document.getElementById('edit-modal-desc').value.trim();
      const price = parseFloat(document.getElementById('edit-modal-price').value);
      const avail = document.getElementById('edit-modal-avail').value;
      const img = document.getElementById('edit-modal-image').value.trim();

      if (!name) return alert('Please enter an item name.');
      if (!catId) return alert('Please select a category.');
      if (isNaN(price) || price < 0) return alert('Please enter a valid price.');

      const saveBtn = document.getElementById('btn-update-menu-item');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

      try {
        await api('restaurant_item_save', {
          id: itemId,
          category_id: catId,
          item_name: name,
          description: desc,
          price: price,
          availability_status: avail,
          image_path: img
        }, 'POST');

        modal.hide();
        window.HotelDialogs?.toast('Menu item updated successfully!');
        await refreshAll();
      } catch (err) {
        alert('Failed to update menu item: ' + err.message);
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Save Changes';
      }
    };
  }

  /**
   * Toggle item availability (Available <-> Unavailable)
   */
  async function toggleItemAvailability(itemId) {
    

    try {
      const res = await api('restaurant_item_toggle', { id: itemId }, 'POST');
      const newStatus = res.availability_status;

      // Update in cache
      const item = cachedItems.find(i => Number(i.id) === Number(itemId));
      if (item) {
        item.availability_status = newStatus;
      }

      // Update stats count locally
      if (cachedStats) {
        if (newStatus === 'Available') {
          cachedStats.available_items++;
          cachedStats.unavailable_items = Math.max(0, cachedStats.unavailable_items - 1);
        } else {
          cachedStats.available_items = Math.max(0, cachedStats.available_items - 1);
          cachedStats.unavailable_items++;
        }
        const availStat = document.getElementById('stat-avail-items');
        if (availStat) availStat.textContent = cachedStats.available_items;
        const unavailStat = document.getElementById('stat-unavail-items');
        if (unavailStat) unavailStat.textContent = cachedStats.unavailable_items;
      }

      window.HotelDialogs?.toast(`Item marked as ${newStatus}`);
      renderMenuManagementTab();
    } catch (err) {
      alert('Failed to update item availability: ' + err.message);
    }
  }

  /**
   * Modal to add a new category with duplicate prevention
   */
  function openAddCategoryModal(isFromItemModal = false) {
    

    const catName = prompt(`Enter new ${activeMenuType} Category Name:`);
    if (!catName || !catName.trim()) return;

    const trimmed = catName.trim();

    // Client-side duplicate check
    const exists = cachedCategories.some(c =>
      (c.menu_type || 'Food').toLowerCase() === activeMenuType.toLowerCase() &&
      c.category_name.toLowerCase() === trimmed.toLowerCase()
    );

    if (exists) {
      alert(`Category "${trimmed}" already exists in the ${activeMenuType} Menu.`);
      return;
    }

    api('restaurant_category_save', {
      category_name: trimmed,
      menu_type: activeMenuType
    }, 'POST').then(res => {
      window.HotelDialogs?.toast(`Category "${trimmed}" created!`);
      refreshAll().then(() => {
        if (isFromItemModal) {
          const catSelect = document.getElementById('item-modal-category');
          if (catSelect && res.id) {
            catSelect.value = String(res.id);
          }
        }
      });
    }).catch(err => {
      alert('Failed to create category: ' + err.message);
    });
  }

  /**
   * Advance order status (Workflow: Pending -> Confirmed -> Preparing -> Ready for Serving -> Served -> Completed / Cancelled)
   */
  async function updateOrderStatus(orderId, newStatus) {
    try {
      await api('restaurant_order_status', {
        order_id: orderId,
        order_status: newStatus
      }, 'POST');

      // Update local cache
      const order = cachedOrders.find(o => Number(o.id) === Number(orderId));
      if (order) {
        order.order_status = newStatus;
      }

      window.HotelDialogs?.toast(`Order marked as ${newStatus}!`);
      await refreshOrders();
      await refreshStats();
    } catch (err) {
      alert('Failed to update order status: ' + err.message);
    }
  }

  /**
   * Modal to view full order details
   */
  function viewOrderDetails(orderId) {
    const order = cachedOrders.find(o => Number(o.id) === Number(orderId));
    if (!order) return alert('Order not found.');

    const modalId = 'modal-view-order-details';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = modalId;
      modalEl.className = 'modal fade';
      modalEl.tabIndex = -1;
      document.body.appendChild(modalEl);
    }

    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content border-0 shadow">
          <div class="modal-header">
            <div>
              <h6 class="modal-title fw-bold">Order Details · ${esc(order.order_code)}</h6>
              <div class="small text-muted">${esc(order.order_type || 'Room Service')} · ${esc(order.created_at)}</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4">
            <div class="row g-3 mb-4">
              <div class="col-md-4">
                <div class="p-3 bg-light rounded-3">
                  <div class="small text-muted fw-semibold">Customer</div>
                  <div class="fw-bold text-dark mt-1">${esc(order.customer_name || 'Guest')}</div>
                </div>
              </div>
              <div class="col-md-4">
                <div class="p-3 bg-light rounded-3">
                  <div class="small text-muted fw-semibold">Destination</div>
                  <div class="fw-bold text-dark mt-1">${order.room_number ? 'Room ' + esc(order.room_number) : 'Restaurant Dine-in'}</div>
                </div>
              </div>
              <div class="col-md-4">
                <div class="p-3 bg-light rounded-3">
                  <div class="small text-muted fw-semibold">Status</div>
                  <div class="fw-bold mt-1">
                    <span class="badge text-bg-primary">${esc(order.order_status)}</span>
                  </div>
                </div>
              </div>
            </div>

            ${order.notes ? `
              <div class="alert alert-light border mb-4">
                <strong class="text-danger small"><i class="bi bi-chat-left-dots me-1"></i>Special Instructions / Notes:</strong>
                <div class="text-dark mt-1">${esc(order.notes)}</div>
              </div>
            ` : ''}

            <h6 class="fw-bold mb-2">Order Items</h6>
            <div class="table-responsive border rounded-3 mb-3">
              <table class="table align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th class="text-center">Quantity</th>
                    <th class="text-end">Unit Price</th>
                    <th class="text-end">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${(order.items || []).map(i => `
                    <tr>
                      <td class="fw-semibold text-dark">${esc(i.item_name)}</td>
                      <td><span class="badge text-bg-light border text-muted">${esc(i.category_name || '-')}</span></td>
                      <td class="text-center">${i.quantity}</td>
                      <td class="text-end">${php(i.unit_price)}</td>
                      <td class="text-end fw-bold text-dark">${php(i.subtotal)}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot class="table-light">
                  <tr>
                    <td colspan="4" class="text-end fw-bold">Total Amount:</td>
                    <td class="text-end fw-bold text-primary fs-6">${php(order.total_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    `;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }

  /**
   * Helper functions
   */
  async function refreshStats() {
    try {
      const statsRes = await api('restaurant_dashboard_stats', {}, 'GET');
      cachedStats = statsRes.stats || {};
      const statEls = {
        'stat-total-items': cachedStats.total_menu_items,
        'stat-avail-items': cachedStats.available_items,
        'stat-unavail-items': cachedStats.unavailable_items,
        'stat-total-orders': cachedStats.total_orders,
        'stat-pending-orders': cachedStats.pending_orders,
        'stat-completed-orders': cachedStats.completed_orders
      };
      Object.entries(statEls).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || 0;
      });
      const badge = document.getElementById('tab-pending-badge');
      if (badge) {
        if (cachedStats.pending_orders > 0) {
          badge.textContent = cachedStats.pending_orders;
          badge.classList.remove('d-none');
        } else {
          badge.classList.add('d-none');
        }
      }
    } catch (_) {}
  }

  async function refreshOrders() {
    try {
      const ordersRes = await api('restaurant_orders_list', {}, 'GET');
      cachedOrders = ordersRes.orders || [];
      if (activeTab === 'orders') renderOrdersTab();
    } catch (_) {}
  }

  async function refreshAll() {
    try {
      const [statsRes, menuRes, ordersRes] = await Promise.all([
        api('restaurant_dashboard_stats', {}, 'GET'),
        api('restaurant_menu_list', {}, 'GET'),
        api('restaurant_orders_list', {}, 'GET')
      ]);
      cachedStats = statsRes.stats || {};
      cachedCategories = menuRes.categories || [];
      cachedItems = menuRes.items || [];
      cachedOrders = ordersRes.orders || [];
      renderFullDashboard();
    } catch (e) {
      console.error('Failed to refresh restaurant dashboard:', e);
    }
  }

  function switchTab(tab) {
    activeTab = tab;
    renderFullDashboard();
  }

  function switchMenuType(type) {
    activeMenuType = type;
    activeCategoryFilter = '';
    renderMenuManagementTab();
  }

  function filterCategory(catId) {
    activeCategoryFilter = catId;
    renderMenuManagementTab();
  }

  function filterAvailability(status) {
    activeAvailabilityFilter = status;
    renderMenuManagementTab();
  }

  function filterOrders(filter) {
    activeOrdersFilter = filter;
    renderOrdersTab();
  }

  function clearSearch() {
    activeSearchTerm = '';
    const input = document.getElementById('rest-search-input');
    if (input) input.value = '';
    renderMenuManagementTab();
  }

  function resetFilters() {
    activeSearchTerm = '';
    activeCategoryFilter = '';
    activeAvailabilityFilter = 'all';
    renderMenuManagementTab();
  }

  function onModalMenuTypeChange(type) {
    const catSelect = document.getElementById('item-modal-category');
    if (!catSelect) return;
    const typeCategories = cachedCategories.filter(c => (c.menu_type || 'Food') === type);
    catSelect.innerHTML = '<option value="">-- Select Category --</option>' +
      typeCategories.map(c => `<option value="${c.id}">${esc(c.category_name)}</option>`).join('');
  }

  // Real-time WebSocket Event Listener
  document.addEventListener('hotel:ws_event', (e) => {
    const msg = e.detail || {};
    const ev = msg.event;
    if (['RESTAURANT_ORDER_CREATED', 'RESTAURANT_ORDER_STATUS_CHANGED'].includes(ev)) {
      refreshOrders();
      refreshStats();
    } else if (['RESTAURANT_ITEM_TOGGLED', 'RESTAURANT_MENU_UPDATED', 'RESTAURANT_CATEGORY_CREATED', 'MENU_CATEGORY_CREATED', 'CATALOG_UPDATED', 'CATALOG_ITEM_TOGGLED'].includes(ev)) {
      refreshAll();
    }
  });


  /**
   * Modal to Take a New Restaurant Order (Dine-In, Takeaway, Room Service)
   * With separated Category dropdown and dynamically updated Category Items dropdown,
   * Automatic price & total calculation, and full payment handling!
   */
  async function openCreateOrderModal() {
    try {
      const [staysRes, menuRes] = await Promise.all([
        api('active_stays', {}, 'GET').catch(() => ({ stays: [] })),
        api('restaurant_menu_list', {}, 'GET').catch(() => ({ categories: cachedCategories, items: cachedItems }))
      ]);

      const stays = staysRes.stays || [];
      const categories = menuRes.categories || cachedCategories || [];
      const allItems = (menuRes.items || cachedItems || []).filter(i => i.availability_status === 'Available');

      const modalId = 'modal-restaurant-create-order';
      let modalEl = document.getElementById(modalId);
      if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        document.body.appendChild(modalEl);
      }

      modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content border-0 shadow">
            <div class="modal-header bg-light">
              <h5 class="modal-title fw-bold text-dark">
                <i class="bi bi-cart-plus me-2 text-primary"></i>Take New Restaurant Order
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <form id="form-restaurant-take-order">
              <div class="modal-body p-4">
                <div class="row g-3">
                  <!-- Order Type -->
                  <div class="col-md-5">
                    <label class="form-label small fw-semibold">Order Type <span class="text-danger">*</span></label>
                    <select class="form-select" id="neworder-type" required>
                      <option value="Dine-In" selected>🍽️ Dine-In (Restaurant)</option>
                      <option value="Takeaway">🥡 Takeaway (To Go / Pickup)</option>
                      <option value="Room Service">🛎️ Room Service (In-Room)</option>
                    </select>
                  </div>

                  <!-- Destination / Guest Selection -->
                  <div class="col-md-7">
                    <div id="neworder-room-wrap" style="display: none;">
                      <label class="form-label small fw-semibold">Active Checked-in Room <span class="text-danger">*</span></label>
                      <select class="form-select" id="neworder-stay-id">
                        <option value="">-- Select Active Room & Guest --</option>
                        ${stays.map(s => `
                          <option value="${s.id}" data-room="${esc(s.room_number)}" data-guest="${esc(s.guest_name || 'Guest')}">
                            Room ${esc(s.room_number)} — ${esc(s.guest_name || 'Guest')} (${esc(s.stay_code)})
                          </option>
                        `).join('')}
                      </select>
                      ${stays.length === 0 ? '<div class="form-text text-danger small">No active checked-in rooms right now.</div>' : ''}
                    </div>

                    <div id="neworder-table-wrap">
                      <label class="form-label small fw-semibold">Table / Customer Identifier <span class="text-danger">*</span></label>
                      <input type="text" class="form-control" id="neworder-dest-name" placeholder="e.g. Table 4, Juan Dela Cruz, Bar Counter" maxlength="100">
                    </div>
                  </div>

                  <!-- Category Dropdown -->
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Product Category <span class="text-danger">*</span></label>
                    <select class="form-select" id="neworder-category-select" required>
                      <option value="">-- Choose Category --</option>
                      <optgroup label="Food Menu Categories">
                        ${categories.filter(c => c.menu_type === 'Food').map(c => `
                          <option value="${c.id}">${esc(c.category_name)}</option>
                        `).join('')}
                      </optgroup>
                      <optgroup label="Drinks Menu Categories">
                        ${categories.filter(c => c.menu_type === 'Drinks').map(c => `
                          <option value="${c.id}">${esc(c.category_name)}</option>
                        `).join('')}
                      </optgroup>
                    </select>
                  </div>

                  <!-- Category Items Dropdown -->
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Product Item Name <span class="text-danger">*</span></label>
                    <select class="form-select" id="neworder-item-select" required disabled>
                      <option value="">-- Choose Category First --</option>
                    </select>
                  </div>

                  <!-- Quantity and Automatic Price Calculation -->
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Quantity <span class="text-danger">*</span></label>
                    <input type="number" class="form-control" id="neworder-qty" value="1" min="1" max="50" required>
                  </div>

                  <div class="col-md-8">
                    <label class="form-label small fw-semibold">Price Calculation</label>
                    <div class="p-2 px-3 rounded bg-light border d-flex justify-content-between align-items-center">
                      <div>
                        <span class="small text-muted">Unit Price:</span>
                        <strong class="ms-1 text-dark" id="neworder-unit-price-display">₱0.00</strong>
                      </div>
                      <div>
                        <span class="small text-muted me-1">Total:</span>
                        <span class="fw-bold fs-5 text-success" id="neworder-total-price-display">₱0.00</span>
                      </div>
                    </div>
                  </div>

                  <!-- Payment Method -->
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Payment Method <span class="text-danger">*</span></label>
                    <select class="form-select" id="neworder-pay-method" required>
                      <option value="Cash" selected>💵 Cash Payment</option>
                      <option value="GCash">📱 GCash / E-Wallet</option>
                      <option value="Credit Card">💳 Credit / Debit Card</option>
                      <option value="Billed to Room">🏨 Charge to Room Folio (Room Service)</option>
                    </select>
                  </div>

                  <!-- Payment Status -->
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Payment Status <span class="text-danger">*</span></label>
                    <select class="form-select" id="neworder-pay-status" required>
                      <option value="Paid" selected>✅ Paid (Settled Immediately)</option>
                      <option value="Unpaid">⏳ Unpaid (Pay Upon Delivery / Bill)</option>
                    </select>
                  </div>

                  <!-- Cash Tendered & Change Calculation (when Cash is selected) -->
                  <div class="col-12" id="neworder-cash-details-wrap">
                    <div class="row g-2 align-items-center p-2 rounded bg-light border">
                      <div class="col-sm-6">
                        <label class="form-label small fw-semibold mb-1">Cash Tendered (₱)</label>
                        <input type="number" step="0.01" min="0" class="form-control form-control-sm" id="neworder-cash-tendered" placeholder="0.00">
                      </div>
                      <div class="col-sm-6 text-sm-end">
                        <div class="small text-muted">Change to Return:</div>
                        <div class="fw-bold fs-5 text-primary" id="neworder-cash-change">₱0.00</div>
                      </div>
                    </div>
                  </div>

                  <!-- Card / GCash Reference (when Non-Cash selected) -->
                  <div class="col-12" id="neworder-ref-wrap" style="display: none;">
                    <label class="form-label small fw-semibold">Reference Number / Transaction ID</label>
                    <input type="text" class="form-control form-control-sm" id="neworder-ref-num" placeholder="e.g. GCash Ref No., Auth Code" maxlength="80">
                  </div>

                  <!-- Kitchen Instructions / Notes -->
                  <div class="col-12">
                    <label class="form-label small fw-semibold">Special Instructions / Chef Notes</label>
                    <textarea class="form-control" id="neworder-notes" rows="2" placeholder="e.g. Extra sauce, no ice, pack separately"></textarea>
                  </div>
                </div>
              </div>
              <div class="modal-footer bg-light">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-primary fw-semibold" id="btn-submit-restaurant-order">
                  <i class="bi bi-check2-circle me-1"></i>Confirm & Place Order
                </button>
              </div>
            </form>
          </div>
        </div>
      `;

      const bsModal = new bootstrap.Modal(modalEl);
      bsModal.show();

      // DOM elements
      const typeSelect = modalEl.querySelector('#neworder-type');
      const roomWrap = modalEl.querySelector('#neworder-room-wrap');
      const tableWrap = modalEl.querySelector('#neworder-table-wrap');
      const staySelect = modalEl.querySelector('#neworder-stay-id');
      const destNameInput = modalEl.querySelector('#neworder-dest-name');
      const catSelect = modalEl.querySelector('#neworder-category-select');
      const itemSelect = modalEl.querySelector('#neworder-item-select');
      const qtyInput = modalEl.querySelector('#neworder-qty');
      const unitDisplay = modalEl.querySelector('#neworder-unit-price-display');
      const totalDisplay = modalEl.querySelector('#neworder-total-price-display');
      const payMethodSelect = modalEl.querySelector('#neworder-pay-method');
      const payStatusSelect = modalEl.querySelector('#neworder-pay-status');
      const cashDetailsWrap = modalEl.querySelector('#neworder-cash-details-wrap');
      const cashTenderedInput = modalEl.querySelector('#neworder-cash-tendered');
      const cashChangeDisplay = modalEl.querySelector('#neworder-cash-change');
      const refWrap = modalEl.querySelector('#neworder-ref-wrap');
      const notesInput = modalEl.querySelector('#neworder-notes');

      let currentUnitPrice = 0;

      // Handle order type toggle (Room Service vs Dine-In/Takeaway)
      typeSelect.addEventListener('change', () => {
        const isRoom = typeSelect.value === 'Room Service';
        roomWrap.style.display = isRoom ? 'block' : 'none';
        tableWrap.style.display = isRoom ? 'none' : 'block';
        if (isRoom) {
          payMethodSelect.value = 'Billed to Room';
          payStatusSelect.value = 'Unpaid';
          cashDetailsWrap.style.display = 'none';
          refWrap.style.display = 'none';
        } else {
          if (payMethodSelect.value === 'Billed to Room') {
            payMethodSelect.value = 'Cash';
            payStatusSelect.value = 'Paid';
            cashDetailsWrap.style.display = 'block';
            refWrap.style.display = 'none';
          }
        }
      });

      // Handle category dropdown change -> update Category Items dropdown
      catSelect.addEventListener('change', () => {
        const catId = catSelect.value;
        if (!catId) {
          itemSelect.innerHTML = '<option value="">-- Choose Category First --</option>';
          itemSelect.disabled = true;
          currentUnitPrice = 0;
          recalculate();
          return;
        }

        const itemsInCat = allItems.filter(i => String(i.category_id) === String(catId));
        if (itemsInCat.length === 0) {
          itemSelect.innerHTML = '<option value="">-- No available items in this category --</option>';
          itemSelect.disabled = true;
          currentUnitPrice = 0;
          recalculate();
          return;
        }

        itemSelect.disabled = false;
        itemSelect.innerHTML = '<option value="">-- Select Menu Item --</option>' +
          itemsInCat.map(i => `
            <option value="${i.id}" data-price="${i.price}" data-name="${esc(i.item_name)}">
              ${esc(i.item_name)} — ₱${Number(i.price).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </option>
          `).join('');

        currentUnitPrice = 0;
        recalculate();
      });

      // Handle item dropdown change
      itemSelect.addEventListener('change', () => {
        const opt = itemSelect.selectedOptions[0];
        if (opt && opt.dataset.price) {
          currentUnitPrice = Number(opt.dataset.price);
        } else {
          currentUnitPrice = 0;
        }
        recalculate();
      });

      // Handle quantity change
      qtyInput.addEventListener('input', recalculate);

      function recalculate() {
        const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        const total = currentUnitPrice * qty;
        unitDisplay.textContent = php(currentUnitPrice);
        totalDisplay.textContent = php(total);

        // Cash change calculation
        const tendered = parseFloat(cashTenderedInput.value) || 0;
        const change = Math.max(0, tendered - total);
        cashChangeDisplay.textContent = php(change);
      }

      // Handle payment method change
      payMethodSelect.addEventListener('change', () => {
        const pm = payMethodSelect.value;
        if (pm === 'Cash') {
          cashDetailsWrap.style.display = 'block';
          refWrap.style.display = 'none';
          payStatusSelect.value = 'Paid';
        } else if (pm === 'GCash' || pm.includes('Card')) {
          cashDetailsWrap.style.display = 'none';
          refWrap.style.display = 'block';
          payStatusSelect.value = 'Paid';
        } else if (pm === 'Billed to Room') {
          cashDetailsWrap.style.display = 'none';
          refWrap.style.display = 'none';
          payStatusSelect.value = 'Unpaid';
          typeSelect.value = 'Room Service';
          roomWrap.style.display = 'block';
          tableWrap.style.display = 'none';
        }
      });

      cashTenderedInput.addEventListener('input', recalculate);

      // Handle Form Submission
      modalEl.querySelector('#form-restaurant-take-order').onsubmit = async (e) => {
        e.preventDefault();
        const itemId = parseInt(itemSelect.value, 10);
        if (!itemId) {
          window.HotelDialogs?.toast('Please choose a menu item.', 'warning');
          return;
        }

        const isRoom = typeSelect.value === 'Room Service';
        const stayId = isRoom ? parseInt(staySelect.value, 10) : 0;
        if (isRoom && !stayId) {
          window.HotelDialogs?.toast('Please choose an active room for room service.', 'warning');
          return;
        }

        const roomOpt = staySelect.selectedOptions[0];
        const roomNumber = isRoom ? (roomOpt?.dataset?.room || '') : '';
        const customerName = isRoom ? (roomOpt?.dataset?.guest || '') : (destNameInput.value.trim() || 'Dine-In Customer');

        const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        const pm = payMethodSelect.value;
        const ps = (pm === 'Billed to Room') ? 'Billed to Room' : payStatusSelect.value;

        const payload = {
          order_type: typeSelect.value,
          stay_id: stayId,
          room_number: roomNumber,
          customer_name: customerName,
          items: [{ item_id: itemId, quantity: qty }],
          payment_method: pm,
          payment_status: ps,
          notes: notesInput.value.trim()
        };

        const btn = modalEl.querySelector('#btn-submit-restaurant-order');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving Order...';

        try {
          const res = await api('restaurant_order_create', payload);
          bsModal.hide();
          window.HotelDialogs?.toast(res.message || 'Order placed successfully!', 'success');
          await refreshOrders();
          await refreshStats();
          switchTab('orders');
        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Confirm & Place Order';
          window.HotelDialogs?.toast(err.message || 'Failed to place order.', 'error');
        }
      };

    } catch (err) {
      window.HotelDialogs?.toast(err.message || 'Failed to open order form.', 'error');
    }
  }

  /**
   * Modal to Settle Payment for an Unpaid Order
   */
  async function openSettlePaymentModal(orderId) {
    const order = cachedOrders.find(o => o.id === orderId);
    if (!order) {
      window.HotelDialogs?.toast('Order not found.', 'error');
      return;
    }

    const total = Number(order.total_amount || 0);

    const modalId = 'modal-settle-restaurant-payment';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = modalId;
      modalEl.className = 'modal fade';
      modalEl.tabIndex = -1;
      document.body.appendChild(modalEl);
    }

    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow">
          <div class="modal-header bg-success text-white">
            <h5 class="modal-title fw-bold">
              <i class="bi bi-cash-coin me-2"></i>Settle Order Payment
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <form id="form-settle-payment">
            <div class="modal-body p-4">
              <div class="p-3 mb-3 rounded bg-light border">
                <div class="d-flex justify-content-between mb-1">
                  <span class="text-muted small">Order Code:</span>
                  <span class="font-monospace fw-bold">${esc(order.order_code)}</span>
                </div>
                <div class="d-flex justify-content-between mb-1">
                  <span class="text-muted small">Customer / Table:</span>
                  <span class="fw-semibold">${esc(order.customer_name || 'In-House Guest')} ${order.room_number ? `(Room ${esc(order.room_number)})` : ''}</span>
                </div>
                <div class="d-flex justify-content-between pt-2 border-top">
                  <span class="fw-bold">Total Payable:</span>
                  <span class="fw-bold fs-4 text-success">${php(total)}</span>
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label small fw-semibold">Payment Method <span class="text-danger">*</span></label>
                <select class="form-select" id="settle-pay-method" required>
                  <option value="Cash" selected>💵 Cash</option>
                  <option value="GCash">📱 GCash / E-Wallet</option>
                  <option value="Credit Card">💳 Credit / Debit Card</option>
                  ${order.stay_id ? '<option value="Billed to Room">🏨 Charge to Room Folio</option>' : ''}
                </select>
              </div>

              <!-- Cash Tendered & Change -->
              <div id="settle-cash-wrap" class="mb-3">
                <label class="form-label small fw-semibold">Amount Tendered (₱) <span class="text-danger">*</span></label>
                <input type="number" step="0.01" min="${total}" class="form-control" id="settle-cash-tendered" placeholder="0.00" value="${total.toFixed(2)}" required>
                <div class="d-flex justify-content-between align-items-center mt-2 p-2 px-3 rounded bg-light border">
                  <span class="small text-muted">Change to Return:</span>
                  <strong class="fs-5 text-primary" id="settle-cash-change">₱0.00</strong>
                </div>
              </div>

              <!-- Reference Number for Card / GCash -->
              <div id="settle-ref-wrap" class="mb-3" style="display: none;">
                <label class="form-label small fw-semibold">Reference Number / Transaction ID</label>
                <input type="text" class="form-control" id="settle-ref-num" placeholder="e.g. 1029384756" maxlength="80">
              </div>

              <div class="mb-2">
                <label class="form-label small fw-semibold">Notes / Remarks (Optional)</label>
                <input type="text" class="form-control form-control-sm" id="settle-notes" placeholder="Receipt issued, cashier notes...">
              </div>
            </div>
            <div class="modal-footer bg-light">
              <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-success fw-semibold" id="btn-confirm-settle">
                <i class="bi bi-check-circle me-1"></i>Confirm & Collect Payment
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();

    const pmSelect = modalEl.querySelector('#settle-pay-method');
    const cashWrap = modalEl.querySelector('#settle-cash-wrap');
    const cashTendered = modalEl.querySelector('#settle-cash-tendered');
    const cashChange = modalEl.querySelector('#settle-cash-change');
    const refWrap = modalEl.querySelector('#settle-ref-wrap');
    const refInput = modalEl.querySelector('#settle-ref-num');
    const notesInput = modalEl.querySelector('#settle-notes');
    const submitBtn = modalEl.querySelector('#btn-confirm-settle');

    function updateChange() {
      const ten = parseFloat(cashTendered.value) || 0;
      const chg = Math.max(0, ten - total);
      cashChange.textContent = php(chg);
    }
    updateChange();
    cashTendered.addEventListener('input', updateChange);

    pmSelect.addEventListener('change', () => {
      const pm = pmSelect.value;
      if (pm === 'Cash') {
        cashWrap.style.display = 'block';
        refWrap.style.display = 'none';
        cashTendered.required = true;
      } else if (pm === 'GCash' || pm.includes('Card')) {
        cashWrap.style.display = 'none';
        refWrap.style.display = 'block';
        cashTendered.required = false;
      } else {
        cashWrap.style.display = 'none';
        refWrap.style.display = 'none';
        cashTendered.required = false;
      }
    });

    modalEl.querySelector('#form-settle-payment').onsubmit = async (e) => {
      e.preventDefault();
      const pm = pmSelect.value;
      const amount = (pm === 'Cash') ? (parseFloat(cashTendered.value) || total) : total;

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processing...';

      try {
        const res = await api('restaurant_order_pay', {
          order_id: orderId,
          payment_method: pm,
          paid_amount: total,
          payment_reference: refInput.value.trim(),
          notes: notesInput.value.trim()
        });

        bsModal.hide();
        window.HotelDialogs?.toast(res.message || 'Payment recorded successfully!', 'success');
        await refreshOrders();
        await refreshStats();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Confirm & Collect Payment';
        window.HotelDialogs?.toast(err.message || 'Failed to settle payment.', 'error');
      }
    };
  }

  // Expose API globally
  window.HotelRestaurantDashboard = {
    render: renderDashboard,
    switchTab,
    switchMenuType,
    filterCategory,
    filterAvailability,
    filterOrders,
    clearSearch,
    resetFilters,
    openAddItemModal,
    openEditItemModal,
    openAddCategoryModal,
    toggleItemAvailability,
    updateOrderStatus,
    viewOrderDetails,
    openCreateOrderModal,
    openSettlePaymentModal,
    refreshAll,
    refreshOrders,
    onModalMenuTypeChange
  };
})();

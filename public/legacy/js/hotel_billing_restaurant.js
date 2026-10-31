/**
 * Hotel Billing System - Restaurant and Bar Operations
 * Separate role-focused dashboards with secured menu and order workflows.
 */
(() => {
  'use strict';

  const esc = (t) => {
    const d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  };
  const dialogMessage = (title, text, icon = 'info') => {
    if (window.HotelDialogs?.alert) return window.HotelDialogs.alert({ title, text, icon });
    if (window.Swal) return window.Swal.fire({ title, text, icon });
    window.alert(text || title);
  };

  const php = (n) => '₱' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getCurRole = () => (window.HotelAuth?.getUser()?.role || '').toLowerCase().replace(/[&\s_-]/g, '');

  const api = (...args) => {
    if (window.HotelBilling && typeof window.HotelBilling.api === 'function') {
      return window.HotelBilling.api(...args);
    }
    if (window.HotelAuth && typeof window.HotelAuth.request === 'function') {
      return window.HotelAuth.request(...args);
    }
    throw new Error('API client not available');
  };

  const isBarDashboard = () => ['bar', 'bartender', 'minibar'].includes(getCurRole());
  const canManageMenu = () => {
    return ['restaurant', 'foodbeverage', 'food', 'bar', 'bartender', 'minibar'].includes(getCurRole());
  };
  let activeMenuType = 'Food';
  let activeCategoryFilter = '';
  let activeSearchTerm = '';
  let activeAvailabilityFilter = 'all'; // 'all', 'Available', 'Unavailable'
  let cachedCategories = [];
  let cachedItems = [];
  let cachedOrders = [];
  let cachedRequests = [];
  let requestLoadError = '';
  let activeOrdersFilter = 'all'; // 'all', 'active', 'completed', 'cancelled'
  let activeTab = 'menu'; // 'menu', 'orders'
  let currentDashboardRole = '';
  let dashboardContainerId = 'dashboard-content';

  const menuRequestParams = () => ({ menu_type: isBarDashboard() ? 'Drinks' : 'All' });
  const dashboardContainer = () => document.getElementById(dashboardContainerId);
  const openServiceRequests = () => window.HotelBilling?.open('service-requests');

  function renderDepartmentRequestSummary() {
    if (requestLoadError) {
      return `<div class="alert alert-warning">Guest service requests could not be loaded: ${esc(requestLoadError)}</div>`;
    }

    const activeRequests = cachedRequests.filter(request =>
      ['NEW', 'PENDING', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ON_HOLD'].includes(String(request.status || '').toUpperCase())
    );
    const pendingCount = activeRequests.filter(request =>
      ['NEW', 'PENDING', 'ASSIGNED'].includes(String(request.status || '').toUpperCase())
    ).length;
    const recentRequests = activeRequests.slice(0, 3);

    return `
      <section class="card border-0 shadow-sm mb-4" aria-labelledby="department-requests-title">
        <div class="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h3 class="h5 fw-bold mb-1" id="department-requests-title">Guest Requests Assigned to ${isBarDashboard() ? 'Bar' : 'Restaurant'}</h3>
            <div class="small text-muted">${activeRequests.length} active · ${pendingCount} need attention</div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" onclick="HotelRestaurantDashboard.openServiceRequests()">
            Open request queue <i class="bi bi-arrow-right ms-1"></i>
          </button>
        </div>
        <div class="list-group list-group-flush">
          ${recentRequests.length ? recentRequests.map(request => `
            <div class="list-group-item d-flex justify-content-between align-items-start gap-3">
              <div class="min-w-0">
                <strong>Room ${esc(request.room_number || '—')} · ${esc(request.request_code || 'Request')}</strong>
                <div class="small text-muted text-truncate">${esc(request.description || 'Guest request')}</div>
              </div>
              <span class="badge text-bg-light border">${esc(request.status || 'NEW')}</span>
            </div>
          `).join('') : '<div class="list-group-item small text-muted">No active guest requests are assigned to your department.</div>'}
        </div>
      </section>
    `;
  }

  async function loadDepartmentRequests() {
    requestLoadError = '';
    try {
      const requestRes = await api('requests', {}, 'GET');
      cachedRequests = requestRes.requests || [];
    } catch (error) {
      cachedRequests = [];
      requestLoadError = error.message || 'The assigned request queue is unavailable.';
      console.error('Failed to load department guest requests:', error);
    }
  }

  function renderDashboardView() {
    if (isBarDashboard()) renderBarDashboard();
    else renderFullDashboard();
  }

  /**
   * Main render function for Restaurant Dashboard
   */
  async function renderDashboard(containerId = 'dashboard-content', initialTab = null) {
    dashboardContainerId = containerId;
    const container = dashboardContainer();
    if (!container) return;
    const role = getCurRole();
    if (role !== currentDashboardRole) {
      activeTab = 'orders';
      activeOrdersFilter = isBarDashboard() ? 'active' : 'all';
      currentDashboardRole = role;
    }
    if (initialTab) activeTab = initialTab;
    activeMenuType = isBarDashboard() ? 'Drinks' : 'Food';

    container.innerHTML = `
      <div class="text-center py-5 text-muted">
        <div class="spinner-border spinner-border-sm text-dark mb-3" role="status"></div>
        <div>Loading ${isBarDashboard() ? 'Bar' : 'Restaurant'} Dashboard...</div>
      </div>
    `;

    try {
      const [menuRes, ordersRes] = await Promise.all([
        api('restaurant_menu_list', menuRequestParams(), 'GET'),
        api('restaurant_orders_list', {}, 'GET')
      ]);
      await loadDepartmentRequests();

      cachedCategories = menuRes.categories || [];
      cachedItems = menuRes.items || [];
      cachedOrders = ordersRes.orders || [];

      renderDashboardView();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger shadow-sm">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>Failed to load ${isBarDashboard() ? 'bar' : 'restaurant'} dashboard: ${esc(err.message)}
        </div>
      `;
    }
  }

  function renderBarDashboard() {
    const container = dashboardContainer();
    if (!container) return;

    activeMenuType = 'Drinks';
    const activeOrders = cachedOrders.filter(order =>
      ['Pending', 'Confirmed', 'Preparing', 'Ready for Serving'].includes(order.order_status)
    );
    const preparingOrders = cachedOrders.filter(order =>
      ['Confirmed', 'Preparing'].includes(order.order_status)
    );
    const readyOrders = cachedOrders.filter(order => order.order_status === 'Ready for Serving');

    container.innerHTML = `
      <section class="rounded-4 p-4 p-lg-5 mb-4 text-white shadow" style="background:linear-gradient(120deg,#172554,#312e81 58%,#0f766e)">
        <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">
          <div>
            <div class="text-uppercase small fw-semibold opacity-75 mb-2">Bar Operations</div>
            <h2 class="h3 fw-bold mb-1"><i class="bi bi-cup-straw me-2"></i>Drinks & Service Tickets</h2>
            <p class="mb-0 opacity-75">Prepare drink orders, manage availability, and keep the bar queue moving.</p>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            ${canManageMenu() ? `
              <button class="btn btn-light fw-semibold" onclick="HotelRestaurantDashboard.openCreateOrderModal()">
                <i class="bi bi-plus-circle me-1"></i>New Bar Ticket
              </button>
              <button class="btn btn-outline-light fw-semibold" onclick="HotelRestaurantDashboard.openAddItemModal()">
                <i class="bi bi-cup-straw me-1"></i>Add Drink
              </button>
            ` : ''}
            <button class="btn btn-outline-light" onclick="HotelRestaurantDashboard.refreshAll()" title="Refresh bar data">
              <i class="bi bi-arrow-clockwise"></i><span class="ms-1">Refresh</span>
            </button>
          </div>
        </div>
      </section>

      <div class="row g-3 mb-4">
        ${[
          ['Open Tickets', activeOrders.length, 'bi-receipt', 'text-primary'],
          ['Awaiting Acceptance', cachedOrders.filter(order => order.order_status === 'Pending').length, 'bi-inbox', 'text-warning'],
          ['Being Prepared', preparingOrders.length, 'bi-cup-hot', 'text-info'],
          ['Ready at Bar', readyOrders.length, 'bi-bell', 'text-success']
        ].map(([label, count, icon, tone]) => `
          <div class="col-6 col-xl-3">
            <div class="card border-0 shadow-sm h-100">
              <div class="card-body d-flex align-items-center gap-3">
                <div class="${tone} fs-3"><i class="bi ${icon}"></i></div>
                <div><div class="small text-muted">${label}</div><div class="fs-4 fw-bold">${count}</div></div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      ${renderDepartmentRequestSummary()}

      <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
        <div class="btn-group" role="group" aria-label="Bar workspace">
          <button class="btn ${activeTab === 'orders' ? 'btn-dark' : 'btn-outline-dark'}" onclick="HotelRestaurantDashboard.switchTab('orders')">
            <i class="bi bi-receipt me-1"></i>Ticket Queue <span class="badge text-bg-light text-dark ms-1">${activeOrders.length}</span>
          </button>
          <button class="btn ${activeTab === 'menu' ? 'btn-dark' : 'btn-outline-dark'}" onclick="HotelRestaurantDashboard.switchTab('menu')">
            <i class="bi bi-cup-straw me-1"></i>Drinks Catalog <span class="badge text-bg-light text-dark ms-1">${cachedItems.length}</span>
          </button>
        </div>
        ${!canManageMenu() ? '<span class="small text-muted"><i class="bi bi-lock me-1"></i>Menu changes are restricted to authorized bar staff.</span>' : ''}
      </div>
      <div id="bar-tab-content"></div>
    `;

    if (activeTab === 'menu') renderBarMenuTab();
    else renderBarOrderQueue();
  }

  function renderBarOrderQueue() {
    const container = document.getElementById('bar-tab-content');
    if (!container) return;

    let orders = cachedOrders;
    if (activeOrdersFilter === 'active') {
      orders = orders.filter(order => ['Pending', 'Confirmed', 'Preparing', 'Ready for Serving'].includes(order.order_status));
    } else if (activeOrdersFilter === 'completed') {
      orders = orders.filter(order => ['Served', 'Completed'].includes(order.order_status));
    } else if (activeOrdersFilter === 'cancelled') {
      orders = orders.filter(order => order.order_status === 'Cancelled');
    }

    container.innerHTML = `
      <div class="card border-0 shadow-sm">
        <div class="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2 py-3">
          <div>
            <h3 class="h5 fw-bold mb-1">Bar Ticket Queue</h3>
            <div class="small text-muted">Drinks-only tickets are routed here. Mixed food tickets stay with Restaurant.</div>
          </div>
          <div class="btn-group btn-group-sm" role="group" aria-label="Filter bar tickets">
            <button class="btn ${activeOrdersFilter === 'active' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="HotelRestaurantDashboard.filterOrders('active')">Open</button>
            <button class="btn ${activeOrdersFilter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="HotelRestaurantDashboard.filterOrders('all')">All</button>
            <button class="btn ${activeOrdersFilter === 'completed' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="HotelRestaurantDashboard.filterOrders('completed')">Served</button>
            <button class="btn ${activeOrdersFilter === 'cancelled' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="HotelRestaurantDashboard.filterOrders('cancelled')">Cancelled</button>
          </div>
        </div>
        <div class="card-body">
          ${orders.length === 0 ? `
            <div class="text-center text-muted py-5">
              <i class="bi bi-cup-hot fs-1 d-block mb-2"></i>
              <div class="fw-semibold">No ${activeOrdersFilter === 'active' ? 'open' : ''} bar tickets</div>
              <div class="small">New drinks-only orders will appear here.</div>
            </div>
          ` : `<div class="row g-3">
            ${orders.map(order => {
              const items = (order.items || []).map(item => `
                <li class="d-flex justify-content-between gap-3 py-1">
                  <span><strong>${Number(item.quantity) || 1}×</strong> ${esc(item.item_name)}</span>
                </li>
              `).join('');
              const badge = {
                Pending: 'text-bg-warning text-dark',
                Confirmed: 'text-bg-primary',
                Preparing: 'text-bg-info text-dark',
                'Ready for Serving': 'text-bg-success',
                Served: 'text-bg-secondary',
                Completed: 'text-bg-secondary',
                Cancelled: 'text-bg-danger'
              }[order.order_status] || 'text-bg-secondary';
              return `
                <div class="col-12 col-xl-6" id="bar-order-${order.id}">
                  <article class="card h-100 border-0 shadow-sm border-start border-4 ${order.order_status === 'Pending' ? 'border-warning' : order.order_status === 'Ready for Serving' ? 'border-success' : 'border-primary'}">
                    <div class="card-body">
                      <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
                        <div>
                          <div class="small text-muted">BAR TICKET</div>
                          <div class="fw-bold font-monospace">${esc(order.order_code)}</div>
                        </div>
                        <span class="badge ${badge}">${esc(order.order_status)}</span>
                      </div>
                      <ul class="list-unstyled border-top border-bottom py-2 mb-2">${items || '<li class="small text-muted">No item details</li>'}</ul>
                      ${order.notes ? `<div class="small text-danger mb-2"><i class="bi bi-chat-left-text me-1"></i>${esc(order.notes)}</div>` : ''}
                      <div class="d-flex justify-content-between align-items-center small text-muted mb-3">
                        <span>${esc(order.created_at || '')}</span>
                        ${order.estimated_ready_at && !order.ready_at ? `<span>Target ${esc(order.estimated_ready_at)}</span>` : ''}
                      </div>
                      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div class="d-flex gap-2">
                          ${renderBarOrderActions(order)}
                          <button class="btn btn-outline-secondary btn-sm" onclick="HotelRestaurantDashboard.viewOrderDetails(${order.id})" aria-label="View ticket details"><i class="bi bi-eye"></i></button>
                        </div>
                      </div>
                    </div>
                  </article>
                </div>
              `;
            }).join('')}
          </div>`}
        </div>
      </div>
    `;
  }

  function renderBarOrderActions(order) {
    if (order.order_status === 'Pending') {
      return `<button class="btn btn-primary btn-sm fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Confirmed')"><i class="bi bi-check2 me-1"></i>Accept Ticket</button>`;
    }
    if (order.order_status === 'Confirmed') {
      return `<button class="btn btn-info btn-sm fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Preparing')"><i class="bi bi-shuffle me-1"></i>Start Mixing</button>`;
    }
    if (order.order_status === 'Preparing') {
      return `<button class="btn btn-success btn-sm fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Ready for Serving')"><i class="bi bi-bell me-1"></i>Ready at Bar</button>`;
    }
    if (order.order_status === 'Ready for Serving') {
      return `<button class="btn btn-outline-success btn-sm fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Served')"><i class="bi bi-check2 me-1"></i>Mark Served</button>`;
    }
    return '';
  }

  function renderBarMenuTab() {
    const container = document.getElementById('bar-tab-content');
    if (!container) return;
    const categories = cachedCategories.filter(category => category.menu_type === 'Drinks');
    let items = cachedItems.filter(item => item.menu_type === 'Drinks');
    if (activeCategoryFilter) items = items.filter(item => String(item.category_id) === String(activeCategoryFilter));
    if (activeAvailabilityFilter !== 'all') items = items.filter(item => item.availability_status === activeAvailabilityFilter);
    if (activeSearchTerm) {
      const query = activeSearchTerm.toLowerCase();
      items = items.filter(item =>
        (item.item_name || '').toLowerCase().includes(query)
        || (item.description || '').toLowerCase().includes(query)
        || (item.category_name || '').toLowerCase().includes(query)
      );
    }

    container.innerHTML = `
      <div class="card border-0 shadow-sm">
        <div class="card-header bg-white py-3">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <h3 class="h5 fw-bold mb-1">Drinks Catalog</h3>
              <div class="small text-muted">${items.length} drinks shown · Update availability when a drink is out of stock.</div>
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <input id="bar-search-input" class="form-control form-control-sm" style="max-width:220px" placeholder="Find a drink..." value="${esc(activeSearchTerm)}">
              <select class="form-select form-select-sm" style="max-width:170px" onchange="HotelRestaurantDashboard.filterAvailability(this.value)">
                <option value="all" ${activeAvailabilityFilter === 'all' ? 'selected' : ''}>All availability</option>
                <option value="Available" ${activeAvailabilityFilter === 'Available' ? 'selected' : ''}>Available</option>
                <option value="Unavailable" ${activeAvailabilityFilter === 'Unavailable' ? 'selected' : ''}>Unavailable</option>
              </select>
              ${canManageMenu() ? '<button class="btn btn-primary btn-sm" onclick="HotelRestaurantDashboard.openAddCategoryModal()"><i class="bi bi-plus-lg me-1"></i>Category</button>' : ''}
            </div>
          </div>
          <div class="d-flex gap-2 flex-wrap mt-3">
            <button class="btn btn-sm ${!activeCategoryFilter ? 'btn-dark' : 'btn-outline-secondary'}" onclick="HotelRestaurantDashboard.filterCategory('')">All drinks</button>
            ${categories.map(category => `
              <button class="btn btn-sm ${String(activeCategoryFilter) === String(category.id) ? 'btn-dark' : 'btn-outline-secondary'}" onclick="HotelRestaurantDashboard.filterCategory('${category.id}')">${esc(category.category_name)}</button>
            `).join('')}
          </div>
        </div>
        <div class="card-body">
          ${items.length ? `<div class="row g-3">
            ${items.map(item => `
              <div class="col-12 col-md-6 col-xl-4">
                <article class="card h-100 border shadow-sm">
                  ${item.image_path ? `<img src="${esc(item.image_path)}" class="card-img-top" alt="${esc(item.item_name)}" style="height:150px;object-fit:cover">` : ''}
                  <div class="card-body">
                    <div class="d-flex justify-content-between gap-2 mb-2">
                      <span class="badge text-bg-light border">${esc(item.category_name || 'Drinks')}</span>
                      <span class="badge ${item.availability_status === 'Available' ? 'text-bg-success' : 'text-bg-secondary'}">${esc(item.availability_status)}</span>
                    </div>
                    <h4 class="h6 fw-bold">${esc(item.item_name)}</h4>
                    ${item.description ? `<p class="small text-muted mb-2">${esc(item.description)}</p>` : ''}
                    <div class="fs-5 fw-bold text-primary">${php(item.price)}</div>
                  </div>
                  ${canManageMenu() ? `
                    <div class="card-footer bg-white d-flex gap-2">
                      <button class="btn btn-sm ${item.availability_status === 'Available' ? 'btn-outline-secondary' : 'btn-outline-success'}" onclick="HotelRestaurantDashboard.toggleItemAvailability(${item.id})">
                        ${item.availability_status === 'Available' ? 'Mark Unavailable' : 'Mark Available'}
                      </button>
                      <button class="btn btn-outline-primary btn-sm" onclick="HotelRestaurantDashboard.openEditItemModal(${item.id})">Edit</button>
                    </div>
                  ` : ''}
                </article>
              </div>
            `).join('')}
          </div>` : '<div class="text-center text-muted py-5"><i class="bi bi-cup-hot fs-1 d-block mb-2"></i>No drinks match these filters.</div>'}
        </div>
      </div>
    `;

    document.getElementById('bar-search-input')?.addEventListener('input', event => {
      activeSearchTerm = event.target.value.trim();
      renderBarMenuTab();
    });
  }

  /**
   * Render HTML structure of the Restaurant Dashboard
   */
  function renderFullDashboard() {
    const container = dashboardContainer();
    if (!container) return;

    const canEdit = canManageMenu();
    const pendingCount = cachedOrders.filter(order => order.order_status === 'Pending').length;
    const preparingCount = cachedOrders.filter(order => ['Confirmed', 'Preparing'].includes(order.order_status)).length;
    const readyCount = cachedOrders.filter(order => order.order_status === 'Ready for Serving').length;
    const summaryCardsHtml = `
      <div class="row g-3 mb-4">
        ${[
          ['Pending Orders', pendingCount, 'bi-inbox', 'text-warning'],
          ['In Preparation', preparingCount, 'bi-fire', 'text-primary'],
          ['Ready to Serve', readyCount, 'bi-bell', 'text-success']
        ].map(([label, count, icon, tone]) => `
          <div class="col-12 col-md-4">
            <div class="card border-0 shadow-sm">
              <div class="card-body d-flex align-items-center gap-3">
                <i class="bi ${icon} fs-3 ${tone}"></i>
                <div><div class="small text-muted">${label}</div><div class="fs-4 fw-bold">${count}</div></div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

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
                ${pendingCount > 0 ? `<span class="badge rounded-pill text-bg-warning text-dark ms-1">${pendingCount}</span>` : ''}
              </button>
            </div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              ${canEdit ? `
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

    container.innerHTML = summaryCardsHtml + renderDepartmentRequestSummary() + navigationHtml + '<div id="restaurant-tab-content"></div>';

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
    const canEdit = canManageMenu();
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
            <i class="bi bi-receipt me-2 text-primary"></i>Restaurant Order Queue (${orders.length})
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
                    <th>Order Items</th>
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
                        </td>
                        <td>
                          <div class="small text-truncate" style="max-width: 280px;" title="${esc(itemsSummary)}">
                            ${itemsSummary}
                          </div>
                          ${order.notes ? `<div class="small text-danger fst-italic text-truncate" style="max-width: 280px;" title="Note: ${esc(order.notes)}"><i class="bi bi-chat-left-text me-1"></i>${esc(order.notes)}</div>` : ''}
                        </td>
                        <td>
                          <span class="badge ${badgeCls} px-2 py-1" id="order-badge-${order.id}">${esc(order.order_status)}</span>
                        </td>
                        <td class="small text-muted text-nowrap">
                          <div>${esc(order.created_at)}</div>
                          ${order.estimated_ready_at && !order.ready_at ? `<div class="small text-primary">ETA ${esc(order.estimated_ready_at)}</div>` : ''}
                          ${order.ready_at ? `<div class="small text-success fw-semibold">Ready ${esc(order.ready_at)}</div>` : ''}
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
  function renderOrderActions(order) {
    const s = order.order_status;
    if (s === 'Pending') {
      return `
        <button class="btn btn-primary btn-sm fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Confirmed')">
          <i class="bi bi-check2 me-1"></i>Confirm
        </button>
        <button class="btn btn-outline-danger btn-sm" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Cancelled')" title="Cancel Order">
          <i class="bi bi-x"></i>
        </button>
      `;
    }
    if (s === 'Confirmed') {
      return `
        <button class="btn btn-info btn-sm text-dark fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Preparing')">
          <i class="bi bi-fire me-1"></i>Start Prep
        </button>
        <button class="btn btn-outline-danger btn-sm" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Cancelled')" title="Cancel Order">
          <i class="bi bi-x"></i>
        </button>
      `;
    }
    if (s === 'Preparing') {
      return `
        <button class="btn btn-warning btn-sm text-dark fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Ready for Serving')">
          <i class="bi bi-bell me-1"></i>Ready
        </button>
      `;
    }
    if (s === 'Ready for Serving') {
      return `
        <button class="btn btn-success btn-sm fw-semibold" onclick="HotelRestaurantDashboard.updateOrderStatus(${order.id}, 'Served')">
          <i class="bi bi-cup-hot me-1"></i>Mark Served
        </button>
      `;
    }
    if (s === 'Served') {
      return `
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
              <div class="mb-3" ${isBarDashboard() ? 'hidden' : ''}>
                <label class="form-label small fw-semibold">Menu Type <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="item-modal-menu-type" onchange="HotelRestaurantDashboard.onModalMenuTypeChange(this.value)" required>
                  ${isBarDashboard() ? '' : `<option value="Food" ${activeMenuType === 'Food' ? 'selected' : ''}>Food Menu</option>`}
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

      if (!name) return dialogMessage('Notice', 'Please enter an item name.', 'warning');
      if (!catId) return dialogMessage('Notice', 'Please select a category.', 'warning');
      if (isNaN(price) || price < 0) return dialogMessage('Notice', 'Please enter a valid price.', 'warning');

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
        window.HotelDialogs?.toast({title:'Menu item added successfully!', icon:'success'});
        await refreshAll();
      } catch (err) {
        dialogMessage('Could not save menu item', err.message, 'error');
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
    if (!item) return dialogMessage('Notice', 'Item not found.', 'warning');

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

      if (!name) return dialogMessage('Notice', 'Please enter an item name.', 'warning');
      if (!catId) return dialogMessage('Notice', 'Please select a category.', 'warning');
      if (isNaN(price) || price < 0) return dialogMessage('Notice', 'Please enter a valid price.', 'warning');

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
        window.HotelDialogs?.toast({title:'Menu item updated successfully!', icon:'success'});
        await refreshAll();
      } catch (err) {
        dialogMessage('Could not update menu item', err.message, 'error');
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

      window.HotelDialogs?.toast({title:`Item marked as ${newStatus}`, icon:'success'});
      if (isBarDashboard()) renderBarDashboard();
      else renderMenuManagementTab();
    } catch (err) {
      dialogMessage('Could not update availability', err.message, 'error');
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
      dialogMessage('Category already exists', `Category "${trimmed}" already exists in the ${activeMenuType} Menu.`, 'warning');
      return;
    }

    api('restaurant_category_save', {
      category_name: trimmed,
      menu_type: activeMenuType
    }, 'POST').then(res => {
      window.HotelDialogs?.toast({title:`Category "${trimmed}" created!`, icon:'success'});
      refreshAll().then(() => {
        if (isFromItemModal) {
          const catSelect = document.getElementById('item-modal-category');
          if (catSelect && res.id) {
            catSelect.value = String(res.id);
          }
        }
      });
    }).catch(err => {
      dialogMessage('Could not create category', err.message, 'error');
    });
  }

  /**
   * Advance order status (Workflow: Pending -> Confirmed -> Preparing -> Ready for Serving -> Served -> Completed / Cancelled)
   */
  async function updateOrderStatus(orderId, newStatus) {
    const order = cachedOrders.find(o => Number(o.id) === Number(orderId));
    if (newStatus === 'Confirmed' && window.Swal) {
      const result = await window.Swal.fire({title:isBarDashboard() ? 'Accept this bar ticket?' : 'Confirm this order?',text:`${isBarDashboard() ? 'Accept ticket' : 'Confirm order'} ${order?.order_code || '#' + orderId}?`,icon:'question',showCancelButton:true,confirmButtonText:isBarDashboard() ? 'Accept ticket' : 'Confirm order',cancelButtonText:'Review first',confirmButtonColor:'#16a34a',cancelButtonColor:'#64748b',reverseButtons:true});
      if (!result.isConfirmed) return;
    }
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

      window.HotelDialogs?.toast({title:`Order marked as ${newStatus}!`, icon:'success'});
      await refreshOrders();
    } catch (err) {
      if (window.HotelDialogs?.error) await window.HotelDialogs.error({title:'Order update failed',text:err.message}); else alert('Failed to update order status: ' + err.message);
    }
  }

  /**
   * Modal to view full order details
   */
  function viewOrderDetails(orderId) {
    const order = cachedOrders.find(o => Number(o.id) === Number(orderId));
    if (!order) return dialogMessage('Notice', 'Order not found.', 'warning');

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
              <div class="small text-muted">${esc(order.created_at)}</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4">
            <div class="mb-4">
              <span class="small text-muted fw-semibold me-2">Status</span>
              <span class="badge text-bg-primary">${esc(order.order_status)}</span>
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
                  </tr>
                </thead>
                <tbody>
                  ${(order.items || []).map(i => `
                    <tr>
                      <td class="fw-semibold text-dark">${esc(i.item_name)}</td>
                      <td><span class="badge text-bg-light border text-muted">${esc(i.category_name || '-')}</span></td>
                      <td class="text-center">${i.quantity}</td>
                    </tr>
                  `).join('')}
                </tbody>
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

  async function refreshOrders() {
    try {
      const ordersRes = await api('restaurant_orders_list', {}, 'GET');
      cachedOrders = ordersRes.orders || [];
      if (isBarDashboard()) renderBarDashboard();
      else if (activeTab === 'orders') renderOrdersTab();
      else renderFullDashboard();
    } catch (_) {}
  }

  async function refreshAll() {
    try {
      const [menuRes, ordersRes] = await Promise.all([
        api('restaurant_menu_list', menuRequestParams(), 'GET'),
        api('restaurant_orders_list', {}, 'GET')
      ]);
      await loadDepartmentRequests();
      cachedCategories = menuRes.categories || [];
      cachedItems = menuRes.items || [];
      cachedOrders = ordersRes.orders || [];
      renderDashboardView();
    } catch (e) {
      console.error('Failed to refresh restaurant dashboard:', e);
    }
  }

  function switchTab(tab) {
    activeTab = tab;
    renderDashboardView();
  }

  function switchMenuType(type) {
    activeMenuType = isBarDashboard() ? 'Drinks' : (type === 'Drinks' ? 'Drinks' : 'Food');
    activeCategoryFilter = '';
    renderMenuManagementTab();
  }

  function filterCategory(catId) {
    activeCategoryFilter = catId;
    if (isBarDashboard()) renderBarMenuTab();
    else renderMenuManagementTab();
  }

  function filterAvailability(status) {
    activeAvailabilityFilter = status;
    if (isBarDashboard()) renderBarMenuTab();
    else renderMenuManagementTab();
  }

  function filterOrders(filter) {
    activeOrdersFilter = filter;
    if (isBarDashboard()) renderBarOrderQueue();
    else renderOrdersTab();
  }

  function clearSearch() {
    activeSearchTerm = '';
    const input = document.getElementById(isBarDashboard() ? 'bar-search-input' : 'rest-search-input');
    if (input) input.value = '';
    if (isBarDashboard()) renderBarMenuTab();
    else renderMenuManagementTab();
  }

  function resetFilters() {
    activeSearchTerm = '';
    activeCategoryFilter = '';
    activeAvailabilityFilter = 'all';
    if (isBarDashboard()) renderBarMenuTab();
    else renderMenuManagementTab();
  }

  function onModalMenuTypeChange(type) {
    const catSelect = document.getElementById('item-modal-category');
    if (!catSelect) return;
    if (isBarDashboard()) type = 'Drinks';
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
    } else if (['REQUEST_CREATED', 'REQUEST_ASSIGNED', 'REQUEST_STATUS_CHANGED', 'REQUEST_ACKNOWLEDGED', 'REQUEST_ON_HOLD', 'REQUEST_COMPLETED', 'REQUEST_REJECTED'].includes(ev)) {
      refreshAll();
    } else if (['RESTAURANT_ITEM_TOGGLED', 'RESTAURANT_MENU_UPDATED', 'RESTAURANT_CATEGORY_CREATED', 'MENU_CATEGORY_CREATED', 'CATALOG_UPDATED', 'CATALOG_ITEM_TOGGLED'].includes(ev)) {
      refreshAll();
    }
  });


  /**
   * Staff order entry for Dine-In and Takeaway orders.
   */
  async function openCreateOrderModal() {
    try {
      const menuRes = await api('restaurant_menu_list', menuRequestParams(), 'GET');
      const categories = menuRes.categories || cachedCategories || [];
      const allItems = (menuRes.items || cachedItems || []).filter(i => i.availability_status === 'Available');
      const departmentName = isBarDashboard() ? 'Bar' : 'Restaurant';

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
                <i class="bi bi-cart-plus me-2 text-primary"></i>Take New ${departmentName} Order
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
                      <option value="Dine-In" selected>${isBarDashboard() ? '🍸 Dine-In (Bar Counter)' : '🍽️ Dine-In (Restaurant)'}</option>
                      <option value="Takeaway">🥡 Takeaway (To Go / Pickup)</option>
                    </select>
                  </div>

                  <!-- Table / customer label -->
                  <div class="col-md-7">
                    <label class="form-label small fw-semibold">Table / Customer Label</label>
                    <input type="text" class="form-control" id="neworder-dest-name" placeholder="${isBarDashboard() ? 'e.g. Bar Counter, Table 4' : 'e.g. Table 4, Takeaway'}" maxlength="100">
                  </div>

                  <!-- Category Dropdown -->
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Product Category <span class="text-danger">*</span></label>
                    <select class="form-select" id="neworder-category-select" required>
                      <option value="">-- Choose Category --</option>
                      ${isBarDashboard() ? '' : `<optgroup label="Food Menu Categories">
                        ${categories.filter(c => c.menu_type === 'Food').map(c => `
                          <option value="${c.id}">${esc(c.category_name)}</option>
                        `).join('')}
                      </optgroup>`}
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

                  <!-- Preparation instructions -->
                  <div class="col-12">
                    <label class="form-label small fw-semibold">${isBarDashboard() ? 'Bartender Instructions' : 'Special Instructions / Chef Notes'}</label>
                    <textarea class="form-control" id="neworder-notes" rows="2" placeholder="${isBarDashboard() ? 'e.g. No ice, less sweet, garnish on the side' : 'e.g. Extra sauce, no ice, pack separately'}"></textarea>
                  </div>
                </div>
              </div>
              <div class="modal-footer bg-light">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-primary fw-semibold" id="btn-submit-restaurant-order">
                  <i class="bi bi-check2-circle me-1"></i>Place Order
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
      const destNameInput = modalEl.querySelector('#neworder-dest-name');
      const catSelect = modalEl.querySelector('#neworder-category-select');
      const itemSelect = modalEl.querySelector('#neworder-item-select');
      const qtyInput = modalEl.querySelector('#neworder-qty');
      const notesInput = modalEl.querySelector('#neworder-notes');

      // Handle category dropdown change -> update Category Items dropdown
      catSelect.addEventListener('change', () => {
        const catId = catSelect.value;
        if (!catId) {
          itemSelect.innerHTML = '<option value="">-- Choose Category First --</option>';
          itemSelect.disabled = true;
          return;
        }

        const itemsInCat = allItems.filter(i => String(i.category_id) === String(catId));
        if (itemsInCat.length === 0) {
          itemSelect.innerHTML = '<option value="">-- No available items in this category --</option>';
          itemSelect.disabled = true;
          return;
        }

        itemSelect.disabled = false;
        itemSelect.innerHTML = '<option value="">-- Select Menu Item --</option>' +
          itemsInCat.map(i => `
            <option value="${i.id}" data-name="${esc(i.item_name)}">
              ${esc(i.item_name)}
            </option>
          `).join('');
      });

      // Handle Form Submission
      modalEl.querySelector('#form-restaurant-take-order').onsubmit = async (e) => {
        e.preventDefault();
        const itemId = parseInt(itemSelect.value, 10);
        if (!itemId) {
          window.HotelDialogs?.toast({title:'Please choose a menu item.', icon:'warning'});
          return;
        }

        const customerName = destNameInput.value.trim() || (typeSelect.value === 'Takeaway' ? 'Takeaway' : 'Dine-In');

        const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        const payload = {
          order_type: typeSelect.value,
          customer_name: customerName,
          items: [{ item_id: itemId, quantity: qty }],
          notes: notesInput.value.trim()
        };

        const btn = modalEl.querySelector('#btn-submit-restaurant-order');
        const itemName = itemSelect.selectedOptions[0]?.dataset.name || itemSelect.selectedOptions[0]?.textContent || 'Menu item';
        if (window.Swal) {
          const decision = await window.Swal.fire({title:'Place this order?',text:`${qty} × ${itemName} will be sent to the ${isBarDashboard() ? 'bar' : 'restaurant'} queue.`,icon:'question',showCancelButton:true,confirmButtonText:'Place order',cancelButtonText:'Go back',confirmButtonColor:'#16a34a',cancelButtonColor:'#64748b',reverseButtons:true});
          if (!decision.isConfirmed) return;
        } else if (!confirm(`Place ${qty} × ${itemName}?`)) return;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving Order...';

        try {
          const res = await api('restaurant_order_create', payload);
          bsModal.hide();
          window.HotelDialogs?.toast({title:isBarDashboard() ? 'Bar ticket placed successfully!' : res.message || 'Order placed successfully!', icon:'success'});
          await refreshOrders();
          switchTab('orders');
        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Place Order';
          if (window.HotelDialogs?.error) await window.HotelDialogs.error({title:'Order failed', text:err.message || 'Failed to place order.'}); else alert('Failed to place order: ' + err.message);
        }
      };

    } catch (err) {
      window.HotelDialogs?.toast({title:err.message || 'Failed to open order form.', icon:'error'});
    }
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
    refreshAll,
    refreshOrders,
    openServiceRequests,
    onModalMenuTypeChange
  };
})();

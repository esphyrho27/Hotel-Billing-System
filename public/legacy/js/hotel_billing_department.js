/**
 * Hotel Billing System - Department Inventory, Advanced Reports & Order Module
 * Comprehensive solution for Restaurant, Bar, Housekeeping, Maintenance, Laundry, Valet, Room Service.
 * Implements:
 * 1. Inventory stock management, unit costs, reorder alerts for all departments.
 * 2. Daily, weekly, monthly reports and analytics for admin, manager, and all departments.
 * 3. Food and Drinks category management with separated cascading item dropdowns and automatic price calculation.
 * 4. Real-time WebSocket synchronization across all connected clients.
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

  const getAvailableDepts = () => {
    const r = getCurRole();
    if (['admin', 'manager'].includes(r)) {
      return [
        { key: 'restaurant', label: 'Restaurant & Dining', icon: 'cup-hot' },
        { key: 'bar', label: 'Bar & Lounge', icon: 'cup-straw' },
        { key: 'housekeeping', label: 'Housekeeping', icon: 'brush' },
        { key: 'maintenance', label: 'Maintenance & Facility', icon: 'tools' },
        { key: 'laundry', label: 'Laundry Service', icon: 'water' },
        { key: 'valet', label: 'Valet & Parking', icon: 'car-front' },
        { key: 'service', label: 'Room Service & General', icon: 'bell' }
      ];
    }
    const roleMap = {
      restaurant: 'restaurant',
      food_beverage: 'restaurant',
      food: 'restaurant',
      bar: 'bar',
      minibar: 'bar',
      housekeeping: 'housekeeping',
      laundry: 'laundry',
      maintenance: 'maintenance',
      valet: 'valet',
      parking: 'valet',
      parkingvalet: 'valet',
      parking_valet: 'valet',
      service: 'service',
      concierge: 'service',
      frontdesk: 'service'
    };
    const key = roleMap[r] || 'restaurant';
    const deptLabels = {
      restaurant: 'Restaurant & Dining',
      bar: 'Bar & Lounge',
      housekeeping: 'Housekeeping',
      maintenance: 'Maintenance & Facility',
      laundry: 'Laundry Service',
      valet: 'Valet & Parking',
      service: 'Room Service & General'
    };
    const deptIcons = {
      restaurant: 'cup-hot',
      bar: 'cup-straw',
      housekeeping: 'brush',
      maintenance: 'tools',
      laundry: 'water',
      valet: 'car-front',
      service: 'bell'
    };
    return [{ key, label: deptLabels[key] || 'My Department', icon: deptIcons[key] || 'boxes' }];
  };

  let selectedInventoryDept = null;
  let selectedReportDept = null;
  let selectedReportPeriod = 'daily'; // 'daily', 'weekly', 'monthly'
  let cachedInventory = [];
  let currentInventoryFilter = '';
  let currentInventorySearch = '';

  /**
   * Render Department Inventory Panel
   */
  async function renderInventory(deptKey = null) {
    const container = document.getElementById('dept-inventory-content');
    if (!container) return;

    const depts = getAvailableDepts();
    const curRole = getCurRole();
    const isSuper = ['admin', 'manager'].includes(curRole);

    if (!deptKey) {
      deptKey = selectedInventoryDept || depts[0].key;
    }
    selectedInventoryDept = deptKey;

    const currentDeptInfo = depts.find(d => d.key === deptKey) || depts[0];

    container.innerHTML = `
      <div class="card border-0 shadow-sm mb-3">
        <div class="card-body p-3">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              ${isSuper ? `
                <div class="btn-group btn-group-sm" role="group" aria-label="Department Switcher">
                  ${depts.map(d => `
                    <button type="button" class="btn ${d.key === deptKey ? 'btn-primary fw-semibold' : 'btn-outline-secondary'}" onclick="HotelDeptManager.switchInventoryDept('${d.key}')">
                      <i class="bi bi-${d.icon || 'boxes'} me-1"></i>${d.label.split(' ')[0]}
                    </button>
                  `).join('')}
                </div>
              ` : `
                <div class="d-flex align-items-center gap-2">
                  <span class="badge text-bg-primary fs-6 py-2 px-3">
                    <i class="bi bi-${currentDeptInfo.icon} me-1"></i>${currentDeptInfo.label} Inventory
                  </span>
                </div>
              `}
            </div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              ${['restaurant', 'bar'].includes(deptKey) || isSuper ? `
                <button class="btn btn-outline-dark btn-sm fw-semibold" onclick="HotelDeptManager.openAddCategoryModal('${deptKey}')">
                  <i class="bi bi-tag me-1"></i>+ Category
                </button>
                <button class="btn btn-outline-primary btn-sm fw-semibold" onclick="HotelDeptManager.openAddProductModal('${deptKey}')">
                  <i class="bi bi-cup-straw me-1"></i>+ Menu Product
                </button>
              ` : ''}
              <button class="btn btn-primary btn-sm fw-semibold" onclick="HotelDeptManager.openAddInventoryModal('${deptKey}')">
                <i class="bi bi-plus-lg me-1"></i>Add Stock Item
              </button>
              <button class="btn btn-outline-secondary btn-sm" onclick="HotelDeptManager.refreshInventory('${deptKey}')" title="Refresh">
                <i class="bi bi-arrow-clockwise"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="dept-inventory-table-wrap">
        <div class="text-center p-5 text-muted">
          <span class="spinner-border spinner-border-sm me-2 text-primary"></span>Loading inventory records...
        </div>
      </div>
    `;

    try {
      const res = await window.HotelBilling.api('inventory_list', { department: deptKey }, 'GET');
      cachedInventory = res.inventory || [];
      renderInventoryTable(deptKey);
    } catch (e) {
      const tableWrap = document.getElementById('dept-inventory-table-wrap');
      if (tableWrap) tableWrap.innerHTML = `<div class="alert alert-danger shadow-sm">Failed to load inventory: ${esc(e.message)}</div>`;
    }
  }

  function renderInventoryTable(deptKey) {
    const tableWrap = document.getElementById('dept-inventory-table-wrap');
    if (!tableWrap) return;

    const items = cachedInventory;
    const lowStockItems = items.filter(i => Number(i.quantity) <= Number(i.reorder_level));
    const totalQty = items.reduce((acc, x) => acc + Number(x.quantity || 0), 0);
    const totalVal = items.reduce((acc, x) => acc + (Number(x.quantity || 0) * Number(x.cost_price || 0)), 0);

    // Extract categories for filter
    const categories = Array.from(new Set(items.map(i => i.category || 'General'))).sort();

    // Apply active category filter and search
    let filtered = items;
    if (currentInventoryFilter) {
      filtered = filtered.filter(i => (i.category || 'General') === currentInventoryFilter);
    }
    if (currentInventorySearch) {
      const q = currentInventorySearch.toLowerCase();
      filtered = filtered.filter(i =>
        (i.item_name || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q)
      );
    }

    const summaryHtml = `
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3">
          <div class="card border-0 shadow-sm p-3 h-100">
            <div class="small text-muted fw-semibold mb-1">Total Stock Items</div>
            <div class="fs-4 fw-bold text-dark">${items.length}</div>
            <div class="small text-muted mt-1">${categories.length} categories</div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card border-0 shadow-sm p-3 h-100">
            <div class="small text-muted fw-semibold mb-1">Low Stock Alert</div>
            <div class="fs-4 fw-bold ${lowStockItems.length > 0 ? 'text-danger' : 'text-success'}">
              ${lowStockItems.length}
              ${lowStockItems.length > 0 ? '<span class="badge text-bg-danger fs-6 ms-2">Needs Reorder</span>' : '<span class="badge text-bg-success-subtle text-success fs-6 ms-2">Healthy</span>'}
            </div>
            <div class="small text-muted mt-1">Below threshold level</div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card border-0 shadow-sm p-3 h-100">
            <div class="small text-muted fw-semibold mb-1">Total Quantity Units</div>
            <div class="fs-4 fw-bold text-primary">${totalQty.toLocaleString()}</div>
            <div class="small text-muted mt-1">Units on hand</div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card border-0 shadow-sm p-3 h-100">
            <div class="small text-muted fw-semibold mb-1">Total Inventory Cost</div>
            <div class="fs-4 fw-bold text-dark">${php(totalVal)}</div>
            <div class="small text-muted mt-1">Valuation at cost</div>
          </div>
        </div>
      </div>

      <!-- Search and Filter Bar -->
      <div class="card border-0 shadow-sm mb-3">
        <div class="card-body p-2 p-md-3">
          <div class="row g-2 align-items-center">
            <div class="col-12 col-md-4">
              <div class="input-group input-group-sm">
                <span class="input-group-text bg-white"><i class="bi bi-search text-muted"></i></span>
                <input type="text" id="inv-search-input" class="form-control" placeholder="Search item or category..." value="${esc(currentInventorySearch)}">
              </div>
            </div>
            <div class="col-12 col-md-8">
              <div class="d-flex align-items-center gap-1 flex-wrap">
                <span class="small text-muted me-1 d-none d-md-inline">Category:</span>
                <button type="button" class="btn btn-sm ${!currentInventoryFilter ? 'btn-dark' : 'btn-outline-secondary'} py-0 px-2" onclick="HotelDeptManager.filterInventoryCat('')">All</button>
                ${categories.map(c => `
                  <button type="button" class="btn btn-sm ${currentInventoryFilter === c ? 'btn-dark' : 'btn-outline-secondary'} py-0 px-2" onclick="HotelDeptManager.filterInventoryCat('${esc(c)}')">${esc(c)}</button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    if (!filtered.length) {
      tableWrap.innerHTML = summaryHtml + `
        <div class="card border-0 shadow-sm p-5 text-center">
          <i class="bi bi-inbox text-muted" style="font-size: 2.5rem;"></i>
          <h6 class="fw-bold mt-3 mb-1 text-dark">No inventory items found</h6>
          <p class="text-muted small mb-3">${currentInventorySearch || currentInventoryFilter ? 'No items match your active filters.' : 'No stock records registered for this department yet.'}</p>
          <div>
            ${currentInventorySearch || currentInventoryFilter ? `
              <button class="btn btn-outline-secondary btn-sm me-2" onclick="HotelDeptManager.clearInventoryFilters()">Clear Filters</button>
            ` : ''}
            <button class="btn btn-primary btn-sm" onclick="HotelDeptManager.openAddInventoryModal('${deptKey}')">
              <i class="bi bi-plus-lg me-1"></i>Add First Stock Item
            </button>
          </div>
        </div>
      `;
      setupSearchListener(deptKey);
      return;
    }

    const rows = filtered.map(item => {
      const isLow = Number(item.quantity) <= Number(item.reorder_level);
      const rowVal = Number(item.quantity || 0) * Number(item.cost_price || 0);
      return `
        <tr class="${isLow ? 'table-warning' : ''}">
          <td>
            <div class="fw-bold text-dark">${esc(item.item_name)}</div>
            <div class="small text-muted d-md-none">${esc(item.category || 'General')}</div>
          </td>
          <td class="d-none d-md-table-cell">
            <span class="badge text-bg-light border text-secondary">${esc(item.category || 'General')}</span>
          </td>
          <td>
            <span class="fw-bold ${isLow ? 'text-danger' : 'text-dark'}">${Number(item.quantity).toLocaleString()}</span>
            <span class="small text-muted ms-1">${esc(item.unit || 'pcs')}</span>
            ${isLow ? '<span class="badge text-bg-danger ms-1">Low</span>' : ''}
          </td>
          <td class="d-none d-sm-table-cell">
            <span class="text-muted">${item.reorder_level}</span>
            <span class="small text-muted">${esc(item.unit || 'pcs')}</span>
          </td>
          <td>${php(item.cost_price)}</td>
          <td class="d-none d-md-table-cell fw-semibold text-dark">${php(rowVal)}</td>
          <td class="text-end">
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-primary py-0 px-2" onclick='HotelDeptManager.openEditInventoryModal(${JSON.stringify(item)})' title="Edit">
                <i class="bi bi-pencil-square"></i>
              </button>
              <button class="btn btn-outline-danger py-0 px-2" onclick="HotelDeptManager.deleteInventoryItem(${item.id}, '${deptKey}')" title="Delete">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tableWrap.innerHTML = summaryHtml + `
      <div class="card border-0 shadow-sm">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Item Name</th>
                <th class="d-none d-md-table-cell">Category</th>
                <th>Current Stock</th>
                <th class="d-none d-sm-table-cell">Reorder Alert</th>
                <th>Unit Cost</th>
                <th class="d-none d-md-table-cell">Total Value</th>
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;

    setupSearchListener(deptKey);
  }

  function setupSearchListener(deptKey) {
    const input = document.getElementById('inv-search-input');
    if (!input) return;
    input.addEventListener('input', (e) => {
      currentInventorySearch = e.target.value;
      renderInventoryTable(deptKey);
    });
  }

  /**
   * Render Department Reports & Analytics Panel (Daily, Weekly, Monthly)
   */
  async function renderReports(deptKey = null, period = null) {
    const container = document.getElementById('dept-reports-content');
    if (!container) return;

    const depts = getAvailableDepts();
    const curRole = getCurRole();
    const isSuper = ['admin', 'manager'].includes(curRole);

    if (!deptKey) {
      deptKey = selectedReportDept || depts[0].key;
    }
    selectedReportDept = deptKey;

    if (!period) {
      period = selectedReportPeriod || 'daily';
    }
    selectedReportPeriod = period;

    const currentDeptInfo = depts.find(d => d.key === deptKey) || depts[0];

    container.innerHTML = `
      <div class="card border-0 shadow-sm mb-3">
        <div class="card-body p-3">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              ${isSuper ? `
                <div class="btn-group btn-group-sm" role="group" aria-label="Department Switcher">
                  ${depts.map(d => `
                    <button type="button" class="btn ${d.key === deptKey ? 'btn-primary fw-semibold' : 'btn-outline-secondary'}" onclick="HotelDeptManager.switchReportDept('${d.key}')">
                      <i class="bi bi-${d.icon || 'graph-up'} me-1"></i>${d.label.split(' ')[0]}
                    </button>
                  `).join('')}
                </div>
              ` : `
                <span class="badge text-bg-primary fs-6 py-2 px-3">
                  <i class="bi bi-${currentDeptInfo.icon} me-1"></i>${currentDeptInfo.label} Reports
                </span>
              `}
            </div>
            <div class="d-flex align-items-center gap-2">
              <div class="btn-group btn-group-sm" role="group" aria-label="Period selector">
                <button type="button" class="btn ${period === 'daily' ? 'btn-dark fw-bold' : 'btn-outline-dark'}" onclick="HotelDeptManager.switchReportPeriod('daily')">Daily (14d)</button>
                <button type="button" class="btn ${period === 'weekly' ? 'btn-dark fw-bold' : 'btn-outline-dark'}" onclick="HotelDeptManager.switchReportPeriod('weekly')">Weekly (8w)</button>
                <button type="button" class="btn ${period === 'monthly' ? 'btn-dark fw-bold' : 'btn-outline-dark'}" onclick="HotelDeptManager.switchReportPeriod('monthly')">Monthly (6m)</button>
              </div>
              <button class="btn btn-outline-secondary btn-sm" onclick="HotelDeptManager.refreshReports('${deptKey}')" title="Refresh">
                <i class="bi bi-arrow-clockwise"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="dept-reports-data-wrap">
        <div class="text-center p-5 text-muted">
          <span class="spinner-border spinner-border-sm me-2 text-primary"></span>Loading analytics data...
        </div>
      </div>
    `;

    try {
      const res = await window.HotelBilling.api('department_reports', { department: deptKey }, 'GET');
      const dataWrap = document.getElementById('dept-reports-data-wrap');
      if (!dataWrap) return;

      const sum = res.summary || {};
      const totalAllTime = Number(sum.total_all_time || 0);
      const completedAllTime = Number(sum.completed_all_time || 0);
      const successRate = totalAllTime > 0 ? Math.round((completedAllTime / totalAllTime) * 100) : 100;

      const summaryCards = `
        <div class="row g-3 mb-3">
          <div class="col-6 col-lg-3">
            <div class="card border-0 shadow-sm p-3 h-100">
              <div class="small text-muted fw-semibold mb-1">Today's Orders</div>
              <div class="fs-4 fw-bold text-primary">${Number(sum.requests_today || 0).toLocaleString()}</div>
              <div class="small text-success fw-semibold mt-1">Revenue: ${php(sum.revenue_today || 0)}</div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card border-0 shadow-sm p-3 h-100">
              <div class="small text-muted fw-semibold mb-1">Fulfillment Rate</div>
              <div class="fs-4 fw-bold text-success">${successRate}%</div>
              <div class="small text-muted mt-1">${completedAllTime} of ${totalAllTime} fulfilled</div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card border-0 shadow-sm p-3 h-100">
              <div class="small text-muted fw-semibold mb-1">Active Queue</div>
              <div class="fs-4 fw-bold ${Number(sum.active_queue_count || 0) > 0 ? 'text-warning' : 'text-dark'}">${Number(sum.active_queue_count || 0)}</div>
              <div class="small text-muted mt-1">Pending fulfillment</div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card border-0 shadow-sm p-3 h-100">
              <div class="small text-muted fw-semibold mb-1">All-Time Revenue</div>
              <div class="fs-4 fw-bold text-dark">${php(sum.revenue_all_time || 0)}</div>
              <div class="small text-muted mt-1 text-capitalize">${deptKey} operations</div>
            </div>
          </div>
        </div>
      `;

      let activeRows = [];
      let labelHeader = 'Date';
      if (period === 'daily') {
        labelHeader = 'Date (Last 14 Days)';
        activeRows = (res.daily || []).map(d => {
          const total = Number(d.total_orders || 0);
          const comp = Number(d.completed_orders || 0);
          const rate = total > 0 ? Math.round((comp / total) * 100) : 0;
          return `
            <tr>
              <td class="fw-semibold text-dark"><i class="bi bi-calendar3 me-2 text-primary"></i>${esc(d.date_label)}</td>
              <td><span class="badge text-bg-light border">${total} placed</span></td>
              <td><span class="badge text-bg-success">${comp} done</span></td>
              <td><span class="badge text-bg-secondary">${d.cancelled_orders || 0}</span></td>
              <td>
                <div class="d-flex align-items-center gap-2">
                  <div class="progress flex-grow-1" style="height: 6px;">
                    <div class="progress-bar bg-success" style="width: ${rate}%"></div>
                  </div>
                  <span class="small text-muted">${rate}%</span>
                </div>
              </td>
              <td class="fw-bold text-end text-success">${php(d.total_revenue)}</td>
            </tr>
          `;
        });
      } else if (period === 'weekly') {
        labelHeader = 'Week (Last 8 Weeks)';
        activeRows = (res.weekly || []).map(w => {
          const total = Number(w.total_orders || 0);
          const comp = Number(w.completed_orders || 0);
          const rate = total > 0 ? Math.round((comp / total) * 100) : 0;
          return `
            <tr>
              <td class="fw-semibold text-dark"><i class="bi bi-calendar-range me-2 text-primary"></i>${esc(w.week_label)}</td>
              <td><span class="badge text-bg-light border">${total} placed</span></td>
              <td><span class="badge text-bg-success">${comp} done</span></td>
              <td><span class="badge text-bg-secondary">${w.cancelled_orders || 0}</span></td>
              <td>
                <div class="d-flex align-items-center gap-2">
                  <div class="progress flex-grow-1" style="height: 6px;">
                    <div class="progress-bar bg-success" style="width: ${rate}%"></div>
                  </div>
                  <span class="small text-muted">${rate}%</span>
                </div>
              </td>
              <td class="fw-bold text-end text-success">${php(w.total_revenue)}</td>
            </tr>
          `;
        });
      } else if (period === 'monthly') {
        labelHeader = 'Month (Last 6 Months)';
        activeRows = (res.monthly || []).map(m => {
          const total = Number(m.total_orders || 0);
          const comp = Number(m.completed_orders || 0);
          const rate = total > 0 ? Math.round((comp / total) * 100) : 0;
          return `
            <tr>
              <td class="fw-semibold text-dark"><i class="bi bi-calendar-check me-2 text-primary"></i>${esc(m.month_label)}</td>
              <td><span class="badge text-bg-light border">${total} placed</span></td>
              <td><span class="badge text-bg-success">${comp} done</span></td>
              <td><span class="badge text-bg-secondary">${m.cancelled_orders || 0}</span></td>
              <td>
                <div class="d-flex align-items-center gap-2">
                  <div class="progress flex-grow-1" style="height: 6px;">
                    <div class="progress-bar bg-success" style="width: ${rate}%"></div>
                  </div>
                  <span class="small text-muted">${rate}%</span>
                </div>
              </td>
              <td class="fw-bold text-end text-success">${php(m.total_revenue)}</td>
            </tr>
          `;
        });
      }

      const topItems = res.top_items || [];
      const topItemsHtml = topItems.length ? `
        <div class="card border-0 shadow-sm mt-3">
          <div class="card-header bg-white fw-bold py-3 border-0 d-flex justify-content-between align-items-center">
            <span><i class="bi bi-trophy me-2 text-warning"></i>Most Ordered Items &amp; Services</span>
            <span class="badge text-bg-light border">Top ${topItems.length}</span>
          </div>
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th style="width: 50px;">#</th>
                  <th>Item / Service Description</th>
                  <th class="text-center">Order Count</th>
                  <th class="text-end">Total Revenue Generated</th>
                </tr>
              </thead>
              <tbody>
                ${topItems.map((item, idx) => `
                  <tr>
                    <td><span class="badge rounded-pill ${idx === 0 ? 'text-bg-warning text-dark' : idx === 1 ? 'text-bg-secondary' : idx === 2 ? 'text-bg-dark' : 'text-bg-light border'}">${idx + 1}</span></td>
                    <td class="fw-semibold text-dark">${esc(item.description)}</td>
                    <td class="text-center fw-bold text-primary">${Number(item.count).toLocaleString()}</td>
                    <td class="text-end fw-bold text-success">${php(item.revenue)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : '';

      dataWrap.innerHTML = summaryCards + `
        <div class="card border-0 shadow-sm">
          <div class="card-header bg-white fw-bold py-3 border-0 d-flex justify-content-between align-items-center">
            <span><i class="bi bi-bar-chart-line me-2 text-primary"></i>${labelHeader} Breakdown</span>
            <span class="badge text-bg-primary text-uppercase">${period} view</span>
          </div>
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>${labelHeader}</th>
                  <th>Orders Placed</th>
                  <th>Completed</th>
                  <th>Cancelled</th>
                  <th>Fulfillment Rate</th>
                  <th class="text-end">Revenue Collected</th>
                </tr>
              </thead>
              <tbody>
                ${activeRows.length ? activeRows.join('') : '<tr><td colspan="6" class="text-center p-5 text-muted">No operational records recorded for this period.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        ${topItemsHtml}
      `;
    } catch (e) {
      const dataWrap = document.getElementById('dept-reports-data-wrap');
      if (dataWrap) dataWrap.innerHTML = `<div class="alert alert-danger shadow-sm">Failed to load reports: ${esc(e.message)}</div>`;
    }
  }

  /**
   * Modal to Add / Edit Department Stock Item
   */
  function openAddInventoryModal(deptKey, existing = null) {
    const isEdit = !!existing;
    const modalEl = document.createElement('div');
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow">
          <div class="modal-header bg-light">
            <h5 class="modal-title fw-bold"><i class="bi bi-box-seam me-2 text-primary"></i>${isEdit ? 'Edit Stock Record' : 'Add Inventory Item'}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4">
            <form id="dept-inventory-form" class="row g-3">
              <input type="hidden" name="id" value="${existing?.id || 0}">
              <div class="col-md-6">
                <label class="form-label fw-semibold">Department</label>
                <select class="form-select" name="department" ${!['admin', 'manager'].includes(getCurRole()) ? 'disabled' : ''}>
                  ${getAvailableDepts().map(d => `<option value="${d.key}" ${(existing?.department || deptKey) === d.key ? 'selected' : ''}>${d.label}</option>`).join('')}
                </select>
                ${!['admin', 'manager'].includes(getCurRole()) ? `<input type="hidden" name="department" value="${deptKey}">` : ''}
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">Category / Section</label>
                <input class="form-control" name="category" placeholder="e.g. Beverages, Meat, Linens" value="${esc(existing?.category || 'General')}" required>
              </div>
              <div class="col-12">
                <label class="form-label fw-semibold">Item Name</label>
                <input class="form-control" name="item_name" placeholder="e.g. Bottled Water 500ml, Towels, Rice" value="${esc(existing?.item_name || '')}" required>
              </div>
              <div class="col-md-4">
                <label class="form-label fw-semibold">Current Quantity</label>
                <input class="form-control" type="number" min="0" name="quantity" value="${existing?.quantity != null ? existing.quantity : 0}" required>
              </div>
              <div class="col-md-4">
                <label class="form-label fw-semibold">Unit of Measure</label>
                <input class="form-control" name="unit" placeholder="pcs, kg, bottles, cans" value="${esc(existing?.unit || 'pcs')}" required>
              </div>
              <div class="col-md-4">
                <label class="form-label fw-semibold">Reorder Alert Level</label>
                <input class="form-control" type="number" min="0" name="reorder_level" value="${existing?.reorder_level != null ? existing.reorder_level : 5}" required>
              </div>
              <div class="col-12">
                <label class="form-label fw-semibold">Unit Cost Price (₱)</label>
                <input class="form-control" type="number" step="0.01" min="0" name="cost_price" value="${existing?.cost_price != null ? existing.cost_price : 0}">
                <div class="form-text small">Used for internal stock valuation and cost tracking.</div>
              </div>
              <div class="col-12 text-end pt-3 border-top">
                <button type="button" class="btn btn-light me-2" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-primary fw-semibold"><i class="bi bi-check2 me-1"></i>Save Stock Item</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
    const m = new bootstrap.Modal(modalEl);
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
    m.show();

    modalEl.querySelector('#dept-inventory-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const formData = Object.fromEntries(new FormData(e.target));
        const res = await window.HotelBilling.api('inventory_save', formData);
        m.hide();
        window.HotelBilling.notify(res.message || 'Inventory item saved.');
        renderInventory(formData.department || deptKey);
      } catch (err) {
        window.HotelBilling.notify(err.message, true);
      }
    };
  }

  async function deleteInventoryItem(id, deptKey) {
    const ok = await window.HotelDialogs.confirm({
      title: 'Delete Inventory Item?',
      text: 'Are you sure you want to remove this stock record? This action cannot be undone.',
      confirmButtonText: 'Delete Record',
      isDanger: true
    });
    if (!ok) return;

    try {
      const res = await window.HotelBilling.api('inventory_delete', { id });
      window.HotelBilling.notify(res.message || 'Item deleted.');
      renderInventory(deptKey);
    } catch (e) {
      window.HotelBilling.notify(e.message, true);
    }
  }

  /**
   * Modal to add a new category for Food & Drinks / Bar
   */
  function openAddCategoryModal(dept = 'restaurant', onAdded = null) {
    const modalEl = document.createElement('div');
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow">
          <div class="modal-header bg-light">
            <h5 class="modal-title fw-bold"><i class="bi bi-tag me-2 text-primary"></i>Add Food / Drink Category</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4">
            <form id="menu-cat-form" class="row g-3">
              <div class="col-md-6">
                <label class="form-label fw-semibold">Department</label>
                <select class="form-select" name="department">
                  <option value="restaurant" ${dept === 'restaurant' ? 'selected' : ''}>Restaurant & Dining</option>
                  <option value="bar" ${dept === 'bar' ? 'selected' : ''}>Bar & Lounge</option>
                  <option value="room_service">Room Service</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">Item Classification</label>
                <select class="form-select" name="type">
                  <option value="FOOD" ${dept === 'restaurant' ? 'selected' : ''}>Food Item</option>
                  <option value="DRINK" ${dept === 'bar' ? 'selected' : ''}>Drink / Beverage</option>
                  <option value="SERVICE">Service</option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label fw-semibold">Category Name</label>
                <input class="form-control" name="name" placeholder="e.g. Appetizers, Main Course, Cocktails, Beers, Wines" required>
                <div class="form-text small">This category will appear in the category dropdown when ordering.</div>
              </div>
              <div class="col-12 text-end pt-3 border-top">
                <button type="button" class="btn btn-light me-2" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-primary fw-semibold"><i class="bi bi-check2 me-1"></i>Save Category</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
    const m = new bootstrap.Modal(modalEl);
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
    m.show();

    modalEl.querySelector('#menu-cat-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const formData = Object.fromEntries(new FormData(e.target));
        const res = await window.HotelBilling.api('menu_category_save', formData);
        m.hide();
        window.HotelBilling.notify(res.message || 'Category created.');
        if (typeof onAdded === 'function') onAdded(formData);
      } catch (err) {
        window.HotelBilling.notify(err.message, true);
      }
    };
  }

  /**
   * Modal to add / input product items (Product Category, Item Name, Price)
   */
  async function openAddProductModal(dept = 'restaurant', existing = null, onAdded = null) {
    try {
      const catRes = await window.HotelBilling.api('menu_categories', { department: dept }, 'GET').catch(() => ({ categories: [] }));
      const categories = catRes.categories || [];

      const modalEl = document.createElement('div');
      modalEl.className = 'modal fade';
      modalEl.tabIndex = -1;
      modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content border-0 shadow">
            <div class="modal-header bg-light">
              <h5 class="modal-title fw-bold">
                <i class="bi bi-${dept === 'bar' ? 'cup-straw' : 'cup-hot'} me-2 text-primary"></i>
                ${existing ? 'Edit Product Item' : 'Add Food / Drink Product Item'}
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4">
              <form id="menu-product-form" class="row g-3">
                <input type="hidden" name="id" value="${existing?.id || 0}">
                
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Department Menu</label>
                  <select class="form-select" name="category" id="prod-catalog-dept">
                    <option value="FOOD_BEVERAGE" ${dept === 'restaurant' ? 'selected' : ''}>Restaurant & Food</option>
                    <option value="BAR" ${dept === 'bar' ? 'selected' : ''}>Bar & Lounge Drinks</option>
                  </select>
                </div>
                
                <div class="col-md-6">
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <label class="form-label fw-semibold mb-0">Product Category</label>
                    <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none" id="btn-quick-new-cat">+ New</button>
                  </div>
                  <select class="form-select" name="subcategory" id="prod-subcategory" required>
                    <option value="">-- Choose Category --</option>
                    ${categories.map(c => `
                      <option value="${esc(c.name)}" ${existing?.subcategory === c.name ? 'selected' : ''}>${esc(c.name)} (${esc(c.type)})</option>
                    `).join('')}
                    ${existing?.subcategory && !categories.some(c => c.name === existing.subcategory) ? `<option value="${esc(existing.subcategory)}" selected>${esc(existing.subcategory)}</option>` : ''}
                  </select>
                </div>

                <div class="col-12">
                  <label class="form-label fw-semibold">Product Item Name</label>
                  <input class="form-control" name="name" maxlength="120" placeholder="e.g. Crispy Calamari, San Miguel Light, Classic Mojito" value="${esc(existing?.name || '')}" required>
                </div>

                <div class="col-md-6">
                  <label class="form-label fw-semibold">Item Classification</label>
                  <select class="form-select" name="item_type" id="prod-item-type">
                    <option value="FOOD" ${existing?.item_type === 'FOOD' || dept === 'restaurant' ? 'selected' : ''}>Food Item</option>
                    <option value="DRINK" ${existing?.item_type === 'DRINK' || dept === 'bar' ? 'selected' : ''}>Drink / Beverage</option>
                    <option value="OTHER" ${existing?.item_type === 'OTHER' ? 'selected' : ''}>Service / Other</option>
                  </select>
                </div>

                <div class="col-md-6">
                  <label class="form-label fw-semibold">Price (₱)</label>
                  <input class="form-control" name="price" type="number" min="0" step="0.01" placeholder="0.00" value="${existing?.price != null ? Number(existing.price) : ''}" required>
                </div>

                <div class="col-12">
                  <label class="form-label fw-semibold">Description / Portion / Notes</label>
                  <input class="form-control" name="description" maxlength="255" placeholder="Ingredients, serving size, chilled/warm" value="${esc(existing?.description || '')}">
                </div>

                <div class="col-12 text-end pt-3 border-top">
                  <button type="button" class="btn btn-light me-2" data-bs-dismiss="modal">Cancel</button>
                  <button type="submit" class="btn btn-primary fw-semibold"><i class="bi bi-check2 me-1"></i>Save Product</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalEl);
      const m = new bootstrap.Modal(modalEl);
      modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
      m.show();

      // Quick add category button
      modalEl.querySelector('#btn-quick-new-cat')?.addEventListener('click', () => {
        openAddCategoryModal(dept, async () => {
          const updatedCats = await window.HotelBilling.api('menu_categories', { department: dept }, 'GET').catch(() => ({ categories: [] }));
          const subSel = modalEl.querySelector('#prod-subcategory');
          if (subSel) {
            subSel.innerHTML = '<option value="">-- Choose Category --</option>' + (updatedCats.categories || []).map(c => `<option value="${esc(c.name)}">${esc(c.name)} (${esc(c.type)})</option>`).join('');
          }
        });
      });

      modalEl.querySelector('#menu-product-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
          const f = Object.fromEntries(new FormData(e.target));
          await window.HotelBilling.api('service_catalog_save', {
            id: existing?.id || 0,
            ...f
          });
          m.hide();
          window.HotelBilling.notify('Product item saved.');
          if (window.HotelBilling?.getActiveModule?.() === 'catalog') {
            window.HotelBilling.open('catalog');
          }
          if (typeof onAdded === 'function') onAdded();
        } catch (err) {
          window.HotelBilling.notify(err.message, true);
        }
      };
    } catch (e) {
      window.HotelBilling.notify(e.message, true);
    }
  }

  /**
   * Modal to take a new Food & Drink Order / Guest Service Request
   * Features:
   * - Active stay / room selector
   * - Separated Category dropdown
   * - Separated Items dropdown (filtered by selected category)
   * - Automatic price calculation (Unit Price & Total Price)
   */
  async function openCreateOrderModal(defaultDept = 'restaurant') {
    try {
      const [staysRes, catRes, menuRes] = await Promise.all([
        window.HotelBilling.api('active_stays', {}, 'GET'),
        window.HotelBilling.api('menu_categories', {}, 'GET'),
        window.HotelBilling.api('service_catalog', {}, 'GET')
      ]);

      const stays = staysRes.stays || [];
      if (!stays.length) {
        return window.HotelBilling.notify('There are no active checked-in rooms to take orders for.', true);
      }

      const allCategories = catRes.categories || [];
      const allItems = (menuRes.items || []).filter(i => Number(i.active) === 1);

      const modalEl = document.createElement('div');
      modalEl.className = 'modal fade';
      modalEl.tabIndex = -1;
      modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content border-0 shadow">
            <div class="modal-header bg-light">
              <h5 class="modal-title fw-bold">
                <i class="bi bi-cart-plus me-2 text-primary"></i>Take New Guest Order / Service
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4">
              <form id="create-order-form" class="row g-3">
                <div class="col-md-7">
                  <label class="form-label fw-semibold">Active Room &amp; Guest</label>
                  <select class="form-select" name="stay_id" id="order-stay-select" required>
                    <option value="">-- Select Active Room --</option>
                    ${stays.map(s => `
                      <option value="${s.id}">Room ${esc(s.room_number)} — ${esc(s.guest_name || 'Guest')} (${esc(s.stay_code)})</option>
                    `).join('')}
                  </select>
                </div>
                <div class="col-md-5">
                  <label class="form-label fw-semibold">Department</label>
                  <select class="form-select" name="department" id="order-dept-select">
                    <option value="restaurant" ${defaultDept === 'restaurant' ? 'selected' : ''}>Restaurant</option>
                    <option value="bar" ${defaultDept === 'bar' ? 'selected' : ''}>Bar &amp; Lounge</option>
                    <option value="service" ${defaultDept === 'service' ? 'selected' : ''}>Room Service</option>
                    <option value="housekeeping" ${defaultDept === 'housekeeping' ? 'selected' : ''}>Housekeeping</option>
                    <option value="laundry" ${defaultDept === 'laundry' ? 'selected' : ''}>Laundry</option>
                    <option value="maintenance" ${defaultDept === 'maintenance' ? 'selected' : ''}>Maintenance</option>
                    <option value="valet" ${defaultDept === 'valet' ? 'selected' : ''}>Valet &amp; Parking</option>
                  </select>
                </div>

                <!-- 1. Category Dropdown -->
                <div class="col-12">
                  <label class="form-label fw-semibold">Product Category</label>
                  <select class="form-select" id="order-category-select">
                    <option value="">-- All Categories --</option>
                  </select>
                </div>

                <!-- 2. Product Items Dropdown (filtered by category) -->
                <div class="col-12">
                  <label class="form-label fw-semibold">Product Item / Service</label>
                  <select class="form-select" name="catalog_item_id" id="order-item-select" required>
                    <option value="">-- Select an item --</option>
                  </select>
                </div>

                <!-- 3. Automatic Price Display & Quantity -->
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Quantity</label>
                  <input class="form-control" type="number" min="1" max="100" name="quantity" id="order-qty-input" value="1" required>
                </div>
                <div class="col-md-8">
                  <label class="form-label fw-semibold">Price Calculation</label>
                  <div class="p-2 px-3 rounded bg-light border d-flex justify-content-between align-items-center">
                    <div>
                      <span class="small text-muted">Unit: <strong id="order-unit-price-display">₱0.00</strong></span>
                    </div>
                    <div>
                      <span class="small text-muted me-1">Total:</span>
                      <span class="fw-bold fs-5 text-success" id="order-total-price-display">₱0.00</span>
                    </div>
                  </div>
                  <input type="hidden" name="unit_price" id="order-unit-price-input" value="0">
                </div>

                <div class="col-12">
                  <label class="form-label fw-semibold">Special Instructions / Notes</label>
                  <textarea class="form-control" name="notes" rows="2" placeholder="e.g. Extra sauce, no ice, deliver to room immediately"></textarea>
                </div>

                <div class="col-12 text-end pt-3 border-top">
                  <button type="button" class="btn btn-light me-2" data-bs-dismiss="modal">Cancel</button>
                  <button type="submit" class="btn btn-primary fw-semibold"><i class="bi bi-send me-1"></i>Submit Order</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalEl);
      const m = new bootstrap.Modal(modalEl);
      modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
      m.show();

      const deptSel = modalEl.querySelector('#order-dept-select');
      const catSel = modalEl.querySelector('#order-category-select');
      const itemSel = modalEl.querySelector('#order-item-select');
      const qtyInput = modalEl.querySelector('#order-qty-input');
      const unitDisplay = modalEl.querySelector('#order-unit-price-display');
      const totalDisplay = modalEl.querySelector('#order-total-price-display');
      const unitInput = modalEl.querySelector('#order-unit-price-input');

      const deptCatalogMap = {
        restaurant: ['FOOD_BEVERAGE'],
        bar: ['BAR', 'MINIBAR'],
        service: ['SERVICE', 'FOOD_BEVERAGE', 'BAR'],
        housekeeping: ['HOUSEKEEPING'],
        laundry: ['LAUNDRY'],
        maintenance: ['MAINTENANCE'],
        valet: ['VALET', 'PARKING']
      };

      function updateCategoryDropdown() {
        const d = deptSel.value;
        const allowedCats = deptCatalogMap[d] || [d.toUpperCase()];
        const relevantItems = allItems.filter(i => allowedCats.includes(i.category));

        // Find all subcategories
        const subcats = new Set();
        relevantItems.forEach(i => {
          if (i.subcategory) subcats.add(i.subcategory.trim());
        });

        catSel.innerHTML = '<option value="">-- All Categories --</option>' +
          Array.from(subcats).sort().map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');

        updateItemsDropdown();
      }

      function updateItemsDropdown() {
        const d = deptSel.value;
        const allowedCats = deptCatalogMap[d] || [d.toUpperCase()];
        const selectedSub = catSel.value;

        const filtered = allItems.filter(i => {
          const matchDept = allowedCats.includes(i.category);
          const matchSub = !selectedSub || (i.subcategory === selectedSub);
          return matchDept && matchSub;
        });

        itemSel.innerHTML = '<option value="">-- Select an item --</option>' +
          filtered.map(i => `
            <option value="${i.id}" data-name="${esc(i.name)}" data-price="${i.price}">
              ${esc(i.name)} — ${php(i.price)}
            </option>
          `).join('');

        recalculatePrice();
      }

      function recalculatePrice() {
        const opt = itemSel.selectedOptions[0];
        const unit = opt && opt.value ? Number(opt.dataset.price || 0) : 0;
        const qty = Math.max(1, Number(qtyInput.value || 1));
        const total = unit * qty;

        unitInput.value = unit.toFixed(2);
        unitDisplay.textContent = php(unit);
        totalDisplay.textContent = php(total);
      }

      deptSel.addEventListener('change', updateCategoryDropdown);
      catSel.addEventListener('change', updateItemsDropdown);
      itemSel.addEventListener('change', recalculatePrice);
      qtyInput.addEventListener('input', recalculatePrice);

      updateCategoryDropdown();

      modalEl.querySelector('#create-order-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
          const formData = Object.fromEntries(new FormData(e.target));
          const res = await window.HotelBilling.api('request_create', formData);
          m.hide();
          window.HotelBilling.notify(res.message || 'Order placed successfully.');
          if (window.HotelBilling?.getActiveModule?.() === 'service-requests') {
            window.HotelBilling.open('service-requests');
          }
          if (window.HotelBilling?.refreshRequestBadge) {
            window.HotelBilling.refreshRequestBadge();
          }
        } catch (err) {
          window.HotelBilling.notify(err.message, true);
        }
      };
    } catch (e) {
      window.HotelBilling.notify(e.message, true);
    }
  }

  // Real-time WebSocket event listener
  document.addEventListener('hotel:ws_event', (e) => {
    const msg = e.detail;
    if (!msg || !msg.event) return;

    if (['INVENTORY_UPDATED', 'INVENTORY_DELETED'].includes(msg.event)) {
      const active = window.HotelBilling?.getActiveModule?.();
      if (active === 'dept-inventory') {
        renderInventory(selectedInventoryDept);
      }
    } else if (['REQUEST_CREATED', 'REQUEST_STATUS_CHANGED', 'REQUEST_COMPLETED'].includes(msg.event)) {
      const active = window.HotelBilling?.getActiveModule?.();
      if (active === 'dept-reports') {
        renderReports(selectedReportDept, selectedReportPeriod);
      }
    }
  });

  // Expose methods globally
  window.HotelDeptManager = {
    renderInventory,
    renderReports,
    switchInventoryDept: (dept) => renderInventory(dept),
    switchReportDept: (dept) => renderReports(dept, selectedReportPeriod),
    switchReportPeriod: (period) => renderReports(selectedReportDept, period),
    refreshInventory: (dept) => renderInventory(dept),
    refreshReports: (dept) => renderReports(dept, selectedReportPeriod),
    filterInventoryCat: (cat) => {
      currentInventoryFilter = cat;
      renderInventoryTable(selectedInventoryDept);
    },
    clearInventoryFilters: () => {
      currentInventoryFilter = '';
      currentInventorySearch = '';
      renderInventoryTable(selectedInventoryDept);
    },
    openAddInventoryModal,
    openEditInventoryModal: (item) => openAddInventoryModal(item.department, item),
    deleteInventoryItem,
    openAddCategoryModal,
    openAddProductModal,
    openCreateOrderModal
  };

})();

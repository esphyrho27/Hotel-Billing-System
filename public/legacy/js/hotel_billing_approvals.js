/* Manager approval actions are also enforced by the PHP API. */
(() => {
  const host = () => document.getElementById("discount-approvals-content");
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
  const money = (value) =>
    `₱${Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  function notify(message, failed = false) {
    if (window.HotelDialogs?.toast) return window.HotelDialogs.toast({ title: message, icon: failed ? "error" : "success" });
    const element = document.createElement("div");
    element.className = `alert ${failed ? "alert-danger" : "alert-success"} shadow position-fixed`;
    element.style.cssText =
      "right:20px;bottom:20px;z-index:3000;max-width:420px";
    element.textContent = message;
    document.body.appendChild(element);
    setTimeout(() => element.remove(), 4200);
  }

  async function renderDiscounts() {
    const target = host();
    if (!target) return;

    target.innerHTML = '<div class="text-muted p-3">Loading pending discounts…</div>';
    try {
      const response = await window.HotelAuth.request(
        "pending_discounts",
        {},
        "GET",
      );
      const currentUser = window.HotelAuth.getUser();
      const rows = (response.discounts || [])
        .map((discount) => {
          const ownRequest =
            Number(discount.applied_by) === Number(currentUser?.id);
          return `
            <tr>
              <td>${esc(discount.folio_number)}<div class="small text-muted">${esc(discount.stay_code)}</div></td>
              <td>${esc(discount.name)}<div class="small text-muted">${esc(discount.reason || "No reason provided")}</div></td>
              <td>${money(discount.amount)}</td>
              <td>${esc(discount.username)}</td>
              <td>
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-sm btn-success" data-decision="APPROVE" data-id="${Number(discount.id)}" ${ownRequest ? "disabled title=\"You cannot approve your own request\"" : ""}>Approve</button>
                  <button type="button" class="btn btn-sm btn-outline-danger" data-decision="REJECT" data-id="${Number(discount.id)}">Reject</button>
                </div>
              </td>
            </tr>`;
        })
        .join("");

      const mobileDiscountCards = (response.discounts || [])
        .map((discount) => {
          const ownRequest =
            Number(discount.applied_by) === Number(currentUser?.id);
          return `
            <div class="card border-0 shadow-sm p-3 mb-2">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <span class="fw-bold fs-6">${esc(discount.folio_number)}</span>
                  <div class="small text-muted">${esc(discount.stay_code)}</div>
                </div>
                <span class="badge text-bg-warning fs-6">${money(discount.amount)}</span>
              </div>
              <div class="p-2 bg-light rounded small mb-2">
                <div class="fw-semibold text-dark">${esc(discount.name)}</div>
                <div class="text-muted">${esc(discount.reason || "No reason provided")}</div>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2 small text-muted">
                <span>Requested by: <strong class="text-dark">${esc(discount.username)}</strong></span>
              </div>
              <div class="d-flex gap-2 pt-2 border-top">
                <button type="button" class="btn btn-sm btn-success flex-fill" data-decision="APPROVE" data-id="${Number(discount.id)}" ${ownRequest ? 'disabled title="You cannot approve your own request"' : ''}>Approve</button>
                <button type="button" class="btn btn-sm btn-outline-danger flex-fill" data-decision="REJECT" data-id="${Number(discount.id)}">Reject</button>
              </div>
            </div>`;
        })
        .join("") || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No pending discount approvals.</div>';

      target.innerHTML = `
        <div class="card border-0 shadow-sm">
          <div class="card-body">
            <h5 class="fw-bold">Pending discount approvals</h5>
            <p class="text-muted">Requests require a different authorized approver than the staff member who applied them.</p>
            <div class="d-none d-md-block">
              <div class="table-responsive">
                <table class="table align-middle mb-0">
                  <thead><tr><th>Folio / stay</th><th>Discount / reason</th><th>Amount</th><th>Requested by</th><th>Decision</th></tr></thead>
                  <tbody>${rows || '<tr><td colspan="5" class="text-center text-muted">No pending discount approvals.</td></tr>'}</tbody>
                </table>
              </div>
            </div>
            <div class="d-md-none">
              ${mobileDiscountCards}
            </div>
          </div>
        </div>`;

      target.querySelectorAll("[data-decision]").forEach((button) => {
        button.addEventListener("click", async () => {
          const decision = button.dataset.decision;
          const isApprove = decision === "APPROVE";
          
          if (window.HotelDialogs?.confirm) {
            const confirmed = await window.HotelDialogs.confirm({
              title: isApprove ? "Approve Discount?" : "Reject Discount?",
              text: isApprove 
                ? "Are you sure you want to approve this discount request?" 
                : "Are you sure you want to reject this discount request?",
              confirmButtonText: isApprove ? "Yes, Approve" : "Yes, Reject",
              actionType: isApprove ? "success" : "danger",
              isDanger: !isApprove,
            });
            if (!confirmed) return;
          }

          try {
            await window.HotelAuth.request("discount_status", {
              discount_id: Number(button.dataset.id),
              decision: decision,
            });
            notify(
              isApprove
                ? "Discount approved successfully."
                : "Discount rejected.",
            );
            await renderDiscounts();
          } catch (error) {
            notify(error.message, true);
          }
        });
      });
    } catch (error) {
      target.innerHTML = `<div class="alert alert-danger" role="alert">${esc(error.message || "Unable to load discount approvals.")}</div>`;
    }
  }

  window.HotelApprovals = { renderDiscounts };
})();

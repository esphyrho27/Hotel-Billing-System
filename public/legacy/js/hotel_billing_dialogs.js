/**
 * Hotel Billing System - SweetAlert2 Dialogs & Alerts
 * Centralized, accessible SweetAlert2 dialogs adhering to role-wide button color semantics,
 * confirmation dialogs, loading states, and notification deduplication.
 */
(() => {
  const getSwal = () => {
    return window.Swal || null;
  };

  // Standard Action Button Colors:
  // - Blue (#20394e / #2563eb): Primary, Save, Submit, Assign, Update
  // - Green (#16a34a): Confirm, Approve, Complete, Fulfill, Settle
  // - Amber (#d97706): Warning, Hold, Review
  // - Red (#dc2626): Delete, Reject, Deactivate, Cancel, Errors
  // - Gray (#64748b): Cancel, Close, Back
  const themeColors = {
    primary: '#20394e',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
    cancel: '#64748b'
  };

  let lastToast = { title: '', time: 0 };

  window.HotelDialogs = {
    colors: themeColors,

    alert({ title = 'Notice', text = '', icon = 'info', confirmButtonText = 'OK' }) {
      const s = getSwal();
      if (s) {
        return s.fire({
          title,
          text: String(text || ''),
          icon,
          confirmButtonColor: themeColors.primary,
          confirmButtonText
        });
      }
      return Promise.resolve(window.nativeAlert ? window.nativeAlert(text || title) : alert(text || title));
    },

    success({ title = 'Success', text = '', timer = 2500 }) {
      const s = getSwal();
      if (s) {
        return s.fire({
          title,
          text: String(text || ''),
          icon: 'success',
          confirmButtonColor: themeColors.success,
          timer,
          timerProgressBar: !!timer
        });
      }
      return Promise.resolve(window.nativeAlert ? window.nativeAlert(text || title) : alert(text || title));
    },

    error({ title = 'Error', text = '' }) {
      const s = getSwal();
      if (s) {
        return s.fire({
          title,
          text: String(text || ''),
          icon: 'error',
          confirmButtonColor: themeColors.danger
        });
      }
      return Promise.resolve(window.nativeAlert ? window.nativeAlert(text || title) : alert(text || title));
    },

    warning({ title = 'Warning', text = '', confirmButtonText = 'OK' }) {
      const s = getSwal();
      if (s) {
        return s.fire({
          title,
          text: String(text || ''),
          icon: 'warning',
          confirmButtonColor: themeColors.warning,
          confirmButtonText
        });
      }
      return Promise.resolve(window.nativeAlert ? window.nativeAlert(text || title) : alert(text || title));
    },

    async confirm({
      title = 'Are you sure?',
      text = '',
      icon = 'warning',
      confirmButtonText = 'Continue',
      cancelButtonText = 'Cancel',
      confirmButtonColor = null,
      cancelButtonColor = themeColors.cancel,
      actionType = null,
      isDanger = false
    }) {
      const s = getSwal();

      // Automatically determine appropriate button color based on action semantics
      let btnColor = confirmButtonColor;
      if (!btnColor) {
        const lower = String(confirmButtonText || '').toLowerCase();
        if (isDanger || actionType === 'danger' || /delete|reject|remove|deactivate|destroy/.test(lower)) {
          btnColor = themeColors.danger; // Red for destructive actions only
        } else if (actionType === 'success' || /complete|approve|confirm|settle|checkout|check-in|fulfill/.test(lower)) {
          btnColor = themeColors.success; // Green for confirmation / approvals
        } else if (actionType === 'warning' || /hold|pause|suspend/.test(lower)) {
          btnColor = themeColors.warning; // Amber for warning / on-hold
        } else {
          btnColor = themeColors.primary; // Navy/blue for standard actions
        }
      }

      if (s) {
        const result = await s.fire({
          title,
          text: String(text || ''),
          icon,
          showCancelButton: true,
          confirmButtonText,
          cancelButtonText,
          confirmButtonColor: btnColor,
          cancelButtonColor: cancelButtonColor || themeColors.cancel,
          reverseButtons: true
        });
        return !!result.isConfirmed;
      }
      return window.nativeConfirm ? window.nativeConfirm(text || title) : confirm(text || title);
    },

    async input({
      title,
      text,
      label,
      placeholder = '',
      value = '',
      type = 'text',
      required = false,
      validationMessage = 'This field is required.'
    }) {
      const s = getSwal();
      if (s) {
        const result = await s.fire({
          title,
          text: String(text || ''),
          input: type,
          inputLabel: label,
          inputPlaceholder: placeholder,
          inputValue: value,
          showCancelButton: true,
          confirmButtonText: 'Continue',
          cancelButtonText: 'Cancel',
          confirmButtonColor: themeColors.primary,
          cancelButtonColor: themeColors.cancel,
          reverseButtons: true,
          inputValidator: (input) =>
            required && !String(input || '').trim() ? validationMessage : undefined
        });
        return result.isConfirmed ? result.value : null;
      }
      return window.nativePrompt ? window.nativePrompt(text || title, value) : prompt(text || title, value);
    },

    loading({ title = 'Processing…', text = 'Please wait while the server completes the operation.' } = {}) {
      const s = getSwal();
      if (s) {
        return s.fire({
          title,
          text,
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            s.showLoading();
          }
        });
      }
    },

    closeLoading() {
      const s = getSwal();
      if (s && s.isVisible()) {
        s.close();
      }
    },

    close() {
      const s = getSwal();
      if (s && s.isVisible()) {
        s.close();
      }
    },

    toast({ title = '', icon = 'success', timer = 3500 }) {
      const str = String(title || '').trim();
      const now = Date.now();
      // Debounce: prevent duplicate toast within 1.8 seconds
      if (str && lastToast.title === str && (now - lastToast.time) < 1800) {
        return;
      }
      lastToast = { title: str, time: now };

      const s = getSwal();
      if (s) {
        return s.fire({
          toast: true,
          position: 'top-end',
          icon,
          title: str,
          showConfirmButton: false,
          timer,
          timerProgressBar: true
        });
      }
      // Fallback banner
      const el = document.createElement('div');
      el.className = 'alert ' + (icon === 'error' ? 'alert-danger' : 'alert-success') + ' shadow position-fixed';
      el.style.cssText = 'right:20px;bottom:20px;z-index:9999;max-width:420px';
      el.textContent = str;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), timer);
    }
  };

  // Preserve native browser methods
  if (!window.nativeAlert) window.nativeAlert = window.alert;
  if (!window.nativeConfirm) window.nativeConfirm = window.confirm;
  if (!window.nativePrompt) window.nativePrompt = window.prompt;

  // Intercept native alert() calls across the application
  window.alert = function(message) {
    if (window.Swal) {
      window.Swal.fire({
        title: 'Notice',
        text: String(message || ''),
        icon: 'info',
        confirmButtonColor: themeColors.primary
      });
      return;
    }
    window.nativeAlert(message);
  };
})();

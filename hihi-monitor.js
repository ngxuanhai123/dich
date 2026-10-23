/**
 * HIHI STUDY - UNIFIED REAL-TIME ERROR MONITORING & SENTRY INTEGRATION
 * Hệ thống giám sát lỗi thời gian thực toàn hệ sinh thái HiHi Study
 *
 * Tính năng:
 * 1. Bắt trọn vẹn mọi lỗi JavaScript runtime và Unhandled Promise Rejections.
 * 2. Tự động nạp Sentry Browser SDK không chặn hiển thị trang (Non-blocking).
 * 3. Hỗ trợ kích hoạt Sentry qua lệnh console hoặc localStorage chung toàn hệ thống:
 *    window.setHiHiSentryDSN('https://public@sentry.io/project-id')
 * 4. Lưu vết lỗi cục bộ (sessionStorage & window.__HIHI_ERRORS__) để chẩn đoán nhanh.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'hihi_sentry_dsn';
  var CONFIG_DSN = (window.HIHI_CONFIG && window.HIHI_CONFIG.sentryDsn) || '';
  var STORED_DSN = '';
  try {
    STORED_DSN = localStorage.getItem(STORAGE_KEY) || '';
  } catch (e) {
    STORED_DSN = '';
  }
  var SENTRY_DSN = CONFIG_DSN || STORED_DSN || '';

  // Xác định định danh ứng dụng
  var appName = (function () {
    if (window.HIHI_APP_NAME) return window.HIHI_APP_NAME;
    var segs = window.location.pathname.replace(/^\/|\/$/g, '').split('/');
    return segs[0] || 'hub';
  })();

  // Bộ đệm lỗi thời gian thực
  window.__HIHI_ERRORS__ = window.__HIHI_ERRORS__ || [];

  function recordError(type, message, source, lineno, colno, errorObj) {
    var err = {
      type: type || 'runtime',
      app: appName,
      message: message || (errorObj && errorObj.message) || 'Unknown Script Error',
      stack: (errorObj && errorObj.stack) || '',
      source: source || (errorObj && errorObj.filename) || window.location.href,
      line: lineno || 0,
      col: colno || 0,
      time: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    window.__HIHI_ERRORS__.unshift(err);
    if (window.__HIHI_ERRORS__.length > 50) window.__HIHI_ERRORS__.pop();

    try {
      sessionStorage.setItem('HIHI_RECENT_ERRORS', JSON.stringify(window.__HIHI_ERRORS__.slice(0, 10)));
    } catch (_) {}

    // Chuyển tiếp tới Sentry nếu đã kết nối
    if (window.Sentry && typeof window.Sentry.captureException === 'function') {
      try {
        if (errorObj) {
          window.Sentry.captureException(errorObj);
        } else {
          window.Sentry.captureMessage('[' + appName + '] ' + err.message, 'error');
        }
      } catch (_) {}
    }
  }

  // 1. Lắng nghe lỗi đồng bộ
  window.addEventListener('error', function (event) {
    recordError('runtime', event.message, event.filename, event.lineno, event.colno, event.error);
  });

  // 2. Lắng nghe Promise Rejection chưa xử lý
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var msg = (reason && reason.message) ? reason.message : String(reason);
    recordError('unhandledrejection', msg, '', 0, 0, reason instanceof Error ? reason : null);
  });

  // 3. Tải Sentry Browser SDK (v8) từ CDN bảo mật không chặn render
  function loadSentrySDK() {
    if (window.Sentry) {
      initSentry();
      return;
    }

    var script = document.createElement('script');
    script.src = 'https://browser.sentry-cdn.com/8.38.0/bundle.min.js';
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = function () {
      initSentry();
    };
    script.onerror = function () {
      // CDN không khả dụng hoặc bị Adblocker chặn - tiếp tục vận hành với bộ ghi cục bộ
    };
    document.head.appendChild(script);
  }

  function initSentry() {
    if (!window.Sentry || typeof window.Sentry.init !== 'function') return;

    if (!SENTRY_DSN) {
      return;
    }

    try {
      window.Sentry.init({
        dsn: SENTRY_DSN,
        environment: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'development' : 'production',
        release: 'hihi-' + appName + '@2.0.0',
        tracesSampleRate: 1.0
      });
      window.Sentry.setTag('hihi_app', appName);
      console.info('[HiHi Monitor] ✅ Sentry đã kích hoạt giám sát ứng dụng: ' + appName);
    } catch (e) {
      console.warn('[HiHi Monitor] Không thể khởi tạo Sentry:', e.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSentrySDK);
  } else {
    loadSentrySDK();
  }

  // Tiện ích quản trị
  window.setHiHiSentryDSN = function (dsn) {
    if (!dsn || typeof dsn !== 'string' || !dsn.trim()) {
      console.warn('Vui lòng truyền chuỗi Sentry DSN hợp lệ.');
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, dsn.trim());
      console.log('✅ Đã lưu Sentry DSN! Đang làm mới trang để kích hoạt...');
      setTimeout(function () {
        window.location.reload();
      }, 300);
    } catch (e) {
      console.error('Lỗi lưu DSN vào localStorage:', e);
    }
  };

  window.getHiHiErrors = function () {
    if (!window.__HIHI_ERRORS__ || window.__HIHI_ERRORS__.length === 0) {
      console.log('🎉 Không có lỗi JavaScript nào phát sinh!');
      return [];
    }
    console.table(window.__HIHI_ERRORS__);
    return window.__HIHI_ERRORS__;
  };

  window.testHiHiError = function () {
    console.log('[HiHi Monitor] 🧪 Đang kích hoạt thử nghiệm một ngoại lệ lỗi...');
    setTimeout(function () {
      throw new Error('[HiHi Test Error] Thử nghiệm giám sát lỗi thời gian thực tại ' + appName);
    }, 50);
  };
})();

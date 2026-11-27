/**
 * HIHI STUDY - UNIFIED LEADERBOARD SYSTEM (hihi-leaderboard.js)
 * Bảng Xếp Hạng Toàn Hệ Sinh Thái - Neo-Brutalism Light/Dark Theme, Zero FontAwesome dependency
 */
(function () {
  'use strict';

  // Tránh nạp đè nếu đã khởi tạo
  if (window.__HIHI_LEADERBOARD_INITIALIZED__) return;
  window.__HIHI_LEADERBOARD_INITIALIZED__ = true;

  // --- CẤU HÌNH & TRẠNG THÁI ---
  const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/tuvung-88e8d/databases/(default)/documents';
  const CACHE_MAX_AGE = 60 * 1000; // 60s
  let cachedUsers = null;
  let cacheTimestamp = 0;
  let currentPeriod = 'all'; // 'all' | 'week' | 'month'
  let currentSubject = 'total'; // 'total' | 'tuvung' | 'chinhta' | 'dich' | 'bamhuyet'
  let currentMonth = getMonthKey();
  let searchQuery = '';

  // --- SVG ICONS (Không phụ thuộc FontAwesome) ---
  const SVG_TROPHY = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';
  const SVG_REFRESH = '<svg id="hihiLbRefreshIcon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>';
  const SVG_CLOSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  const SVG_SPINNER = '<svg class="hihi-lb-spin" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
  const SVG_CROWN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="#ffc72e" stroke="#1e1e1e" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>';

  // --- HELPER TIME KEYS ---
  function getWeekKey(d) {
    d = d || new Date();
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }

  function getMonthKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function formatMonthLabel(mk) {
    if (!mk || !/^\d{4}-\d{2}$/.test(mk)) return mk || '';
    const [y, m] = mk.split('-');
    return `Tháng ${parseInt(m, 10)}/${y}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizePhotoUrl(url) {
    const fallback = 'https://www.gravatar.com/avatar/?d=mp';
    if (!url || typeof url !== 'string') return fallback;
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.href;
      }
    } catch (_) {}
    return fallback;
  }

  // --- PARSE FIRESTORE REST DOC ---
  function parseFirestoreDoc(doc) {
    const f = doc.fields || {};
    function parseVal(v) {
      if (!v) return null;
      if ('stringValue' in v) return v.stringValue;
      if ('integerValue' in v) return parseInt(v.integerValue, 10);
      if ('doubleValue' in v) return parseFloat(v.doubleValue);
      if ('booleanValue' in v) return v.booleanValue;
      if ('mapValue' in v) {
        const res = {};
        const mf = v.mapValue.fields || {};
        for (const k in mf) res[k] = parseVal(mf[k]);
        return res;
      }
      return null;
    }
    const obj = { id: doc.name.split('/').pop() };
    for (const k in f) {
      obj[k] = parseVal(f[k]);
    }
    return obj;
  }

  // --- FETCH DỮ LIỆU ĐỒNG THỜI (HIHI_LEADERBOARD + LEGACY LEADERBOARD) ---
  async function fetchLeaderboardData(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedUsers && (now - cacheTimestamp < CACHE_MAX_AGE)) {
      return cachedUsers;
    }

    try {
      const [resHihi, resLegacy] = await Promise.allSettled([
        fetch(`${FIRESTORE_BASE}/hihi_leaderboard`),
        fetch(`${FIRESTORE_BASE}/leaderboard`)
      ]);

      const userMap = new Map();

      if (resHihi.status === 'fulfilled' && resHihi.value.ok) {
        const data = await resHihi.value.json();
        if (data.documents) {
          data.documents.forEach(doc => {
            const u = parseFirestoreDoc(doc);
            if (u.id) {
              userMap.set(u.id, {
                id: u.id,
                uid: u.uid || u.id,
                displayName: u.displayName || 'Học viên',
                photoURL: sanitizePhotoUrl(u.photoURL),
                total_score: Number(u.total_score || 0),
                tuvung_score: Number(u.tuvung_score || 0),
                chinhta_score: Number(u.chinhta_score || 0),
                dich_score: Number(u.dich_score || 0),
                streak: Number(u.streak || u.streak_days || 0),
                week_score: Number(u.week_score || 0),
                month_score: Number(u.month_score || 0),
                week_tuvung: Number(u.week_tuvung || 0),
                week_chinhta: Number(u.week_chinhta || 0),
                week_dich: Number(u.week_dich || 0),
                month_tuvung: Number(u.month_tuvung || 0),
                month_chinhta: Number(u.month_chinhta || 0),
                month_dich: Number(u.month_dich || 0),
                weekKey: u.weekKey || '',
                monthKey: u.monthKey || '',
                monthly: u.monthly || {},
                wpm: Number(u.wpm || 0),
                acc: Number(u.acc || 0)
              });
            }
          });
        }
      }

      if (resLegacy.status === 'fulfilled' && resLegacy.value.ok) {
        const data = await resLegacy.value.json();
        if (data.documents) {
          data.documents.forEach(doc => {
            const leg = parseFirestoreDoc(doc);
            const legScore = Number(leg.score_id || leg.score_en || 0);
            if (!userMap.has(leg.id)) {
              userMap.set(leg.id, {
                id: leg.id,
                uid: leg.id,
                displayName: leg.displayName || 'Học viên',
                photoURL: sanitizePhotoUrl(leg.photoURL),
                total_score: legScore,
                tuvung_score: legScore,
                chinhta_score: 0,
                dich_score: 0,
                streak: 0,
                week_score: Number(leg.score_week_id || leg.score_week_en || 0),
                month_score: Number(leg.score_month_id || leg.score_month_en || 0),
                monthly: {}
              });
            } else {
              const existing = userMap.get(leg.id);
              if (!existing.tuvung_score && legScore > 0) {
                existing.tuvung_score = legScore;
                existing.total_score = Math.max(existing.total_score, legScore);
              }
            }
          });
        }
      }

      cachedUsers = Array.from(userMap.values());
      cacheTimestamp = now;
      window.hihiCachedLeaderboardUsers = cachedUsers;
      populateMonthOptions();
      return cachedUsers;
    } catch (e) {
      console.warn('[HiHi Leaderboard] Lỗi nạp dữ liệu:', e);
      if (cachedUsers) return cachedUsers;
      return [];
    }
  }

  // --- CẬP NHẬT SELECT THÁNG ---
  function populateMonthOptions() {
    const select = document.getElementById('hihiLbMonthSelect');
    if (!select) return;
    const months = new Set();
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.add(getMonthKey(d));
    }
    if (Array.isArray(cachedUsers)) {
      cachedUsers.forEach(u => {
        if (u.monthKey) months.add(u.monthKey);
        if (u.monthly && typeof u.monthly === 'object') {
          Object.keys(u.monthly).forEach(k => {
            if (/^\d{4}-\d{2}$/.test(k)) months.add(k);
          });
        }
      });
    }
    const sorted = Array.from(months).sort().reverse();
    if (!months.has(currentMonth) && sorted.length) {
      currentMonth = sorted[0];
    }
    const thisMonth = getMonthKey();
    select.innerHTML = sorted
      .map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m === thisMonth ? formatMonthLabel(m) + ' (Hiện tại)' : formatMonthLabel(m))}</option>`)
      .join('');
    select.value = currentMonth;
  }

  // --- TÍNH TOÁN ĐIỂM THEO BỘ LỌC KỲ VÀ MÔN ---
  function computeUserScore(u, period, subject, targetMonth) {
    const currWeek = getWeekKey();
    const currMonth = targetMonth || getMonthKey();

    if (subject === 'tuvung') {
      if (period === 'all') return u.tuvung_score || 0;
      if (period === 'week') return (u.weekKey === currWeek ? (u.week_tuvung || 0) : 0);
      if (period === 'month') {
        if (u.monthly && u.monthly[currMonth]) return u.monthly[currMonth].tuvung || 0;
        return (u.monthKey === currMonth ? (u.month_tuvung || 0) : 0);
      }
    }

    if (subject === 'chinhta') {
      if (period === 'all') return u.chinhta_score || 0;
      if (period === 'week') return (u.weekKey === currWeek ? (u.week_chinhta || 0) : 0);
      if (period === 'month') {
        if (u.monthly && u.monthly[currMonth]) return u.monthly[currMonth].chinhta || 0;
        return (u.monthKey === currMonth ? (u.month_chinhta || 0) : 0);
      }
    }

    if (subject === 'dich') {
      if (period === 'all') return u.dich_score || 0;
      if (period === 'week') return (u.weekKey === currWeek ? (u.week_dich || 0) : 0);
      if (period === 'month') {
        if (u.monthly && u.monthly[currMonth]) return u.monthly[currMonth].dich || 0;
        return (u.monthKey === currMonth ? (u.month_dich || 0) : 0);
      }
    }

    if (subject === 'bamhuyet') {
      return u.streak || 0;
    }

    if (period === 'all') {
      return u.total_score || ((u.tuvung_score || 0) + (u.chinhta_score || 0) + (u.dich_score || 0));
    }
    if (period === 'week') {
      return (u.weekKey === currWeek ? (u.week_score || 0) : 0);
    }
    if (period === 'month') {
      if (u.monthly && u.monthly[currMonth]) {
        return u.monthly[currMonth].score || ((u.monthly[currMonth].tuvung || 0) + (u.monthly[currMonth].chinhta || 0) + (u.monthly[currMonth].dich || 0));
      }
      return (u.monthKey === currMonth ? (u.month_score || 0) : 0);
    }

    return u.total_score || 0;
  }

  // --- CẤP ĐỘ DANH HIỆU ---
  function getLevelBadge(score) {
    if (score >= 10000) return { label: 'Huyền thoại', bg: '#ffc72e', fg: '#1e1e1e', emoji: '👑' };
    if (score >= 5000) return { label: 'Đại sư', bg: '#e9d5ff', fg: '#1e1e1e', emoji: '💎' };
    if (score >= 2000) return { label: 'Cao thủ', bg: '#7dd3fc', fg: '#1e1e1e', emoji: '🛡️' };
    if (score >= 500) return { label: 'Chăm chỉ', bg: '#86efac', fg: '#1e1e1e', emoji: '📖' };
    return { label: 'Tân binh', bg: 'var(--color-surface2, #efeee8)', fg: 'var(--color-muted, #40484f)', emoji: '🌱' };
  }

  // --- INJECT CSS & MODAL HTML ---
  function injectStylesAndModal() {
    if (!document.getElementById('hihi-leaderboard-styles')) {
      const style = document.createElement('style');
      style.id = 'hihi-leaderboard-styles';
      style.textContent = `
        @keyframes hihiLbSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .hihi-lb-spin { animation: hihiLbSpin 0.8s linear infinite; display: inline-block; }

        /* MODAL BACKDROP */
        .hihi-lb-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(18, 22, 26, 0.58);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          display: none;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          padding: 16px;
        }
        .hihi-lb-modal-backdrop.active {
          display: flex;
        }

        /* MODAL CONTAINER */
        .hihi-lb-modal-box {
          background: var(--color-surface, #ffffff);
          color: var(--color-ink, #1e1e1e);
          border: 2.5px solid var(--color-ink, #1e1e1e);
          border-radius: 24px;
          width: 100%;
          max-width: 700px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-hard-xl, 8px 8px 0 0 #1e1e1e);
          overflow: hidden;
          font-family: var(--font-sans, "Plus Jakarta Sans", "Segoe UI", system-ui, -apple-system, sans-serif);
        }

        /* HEADER */
        .hihi-lb-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 2.5px solid var(--color-ink, #1e1e1e);
          background: var(--color-surface2, #efeee8);
        }
        .hihi-lb-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 1.15rem;
          font-weight: 800;
          color: var(--color-ink, #1e1e1e);
        }
        .hihi-lb-title-icon {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          background: var(--color-yellow, #ffc72e);
          color: #1e1e1e;
          border: 2px solid var(--color-ink, #1e1e1e);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: var(--shadow-hard-sm, 2px 2px 0 0 #1e1e1e);
          flex-shrink: 0;
        }
        .hihi-lb-actions { display: flex; align-items: center; gap: 8px; }
        .hihi-lb-btn-icon {
          background: var(--color-surface, #ffffff);
          border: 2px solid var(--color-ink, #1e1e1e);
          color: var(--color-ink, #1e1e1e);
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: var(--shadow-hard-sm, 2px 2px 0 0 #1e1e1e);
          transition: transform 0.12s ease, background 0.12s ease;
        }
        .hihi-lb-btn-icon:hover {
          background: var(--color-yellow, #ffc72e);
          color: #1e1e1e;
          transform: translate(-1px, -1px);
        }
        .hihi-lb-btn-icon:active { transform: translate(1px, 1px); }

        /* FILTERS */
        .hihi-lb-filter-area {
          padding: 14px 20px;
          background: var(--color-surface, #ffffff);
          border-bottom: 2px solid var(--color-ink, #1e1e1e);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .hihi-lb-pill-group {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .hihi-lb-filter-label {
          font-size: 0.78rem;
          color: var(--color-muted, #40484f);
          font-weight: 800;
          margin-right: 2px;
        }
        .hihi-lb-pill {
          padding: 6px 13px;
          font-size: 0.78rem;
          font-weight: 700;
          border-radius: 999px;
          border: 2px solid var(--color-ink, #1e1e1e);
          background: var(--color-surface2, #efeee8);
          color: var(--color-ink, #1e1e1e);
          cursor: pointer;
          transition: transform 0.12s ease, background 0.12s ease;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          box-shadow: var(--shadow-hard-sm, 2px 2px 0 0 #1e1e1e);
        }
        .hihi-lb-pill:hover {
          background: var(--color-canvas, #f8f6f1);
          transform: translateY(-1px);
        }
        .hihi-lb-pill.active {
          background: var(--color-yellow, #ffc72e) !important;
          color: #1e1e1e !important;
          border-color: var(--color-ink, #1e1e1e) !important;
          font-weight: 800;
        }
        .hihi-lb-month-wrap {
          display: none;
          align-items: center;
          gap: 6px;
        }
        .hihi-lb-month-wrap.visible { display: inline-flex; }
        .hihi-lb-month-select {
          background: var(--color-surface2, #efeee8);
          color: var(--color-ink, #1e1e1e);
          border: 2px solid var(--color-ink, #1e1e1e);
          border-radius: 999px;
          padding: 5px 12px;
          font-size: 0.78rem;
          font-weight: 700;
          outline: none;
          cursor: pointer;
          font-family: inherit;
        }
        .hihi-lb-search-input {
          background: var(--color-surface2, #efeee8);
          border: 2px solid var(--color-ink, #1e1e1e);
          border-radius: 14px;
          padding: 8px 14px;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--color-ink, #1e1e1e);
          outline: none;
          width: 100%;
          box-sizing: border-box;
          font-family: inherit;
        }
        .hihi-lb-search-input::placeholder { color: var(--color-faint, #707880); }
        .hihi-lb-search-input:focus {
          background: var(--color-surface, #ffffff);
          box-shadow: var(--shadow-hard-sm, 2px 2px 0 0 #1e1e1e);
        }

        /* CONTENT BODY */
        .hihi-lb-body {
          padding: 18px 20px;
          overflow-y: auto;
          flex: 1;
          background: var(--color-canvas, #f8f6f1);
        }

        /* PODIUM STAGES (TOP 1, 2, 3) */
        .hihi-lb-podium {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 12px;
          margin-bottom: 22px;
          padding-top: 16px;
        }
        .hihi-lb-podium-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          width: clamp(86px, 28vw, 132px);
        }
        .hihi-lb-podium-avatar-wrap {
          position: relative;
          margin-bottom: 8px;
        }
        .hihi-lb-podium-avatar {
          width: 54px;
          height: 54px;
          border-radius: 50%;
          object-fit: cover;
          border: 2.5px solid var(--color-ink, #1e1e1e);
          background: var(--color-surface, #ffffff);
          box-shadow: var(--shadow-hard-sm, 2px 2px 0 0 #1e1e1e);
        }
        .hihi-lb-podium-item.top-1 .hihi-lb-podium-avatar {
          width: 68px;
          height: 68px;
          border-width: 3px;
        }
        .hihi-lb-podium-crown {
          position: absolute;
          top: -16px;
          left: 50%;
          transform: translateX(-50%);
          display: inline-flex;
          line-height: 1;
        }
        .hihi-lb-podium-name {
          font-size: 0.82rem;
          font-weight: 800;
          color: var(--color-ink, #1e1e1e);
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .hihi-lb-podium-score {
          font-size: 0.78rem;
          font-weight: 800;
          color: var(--color-cyan-deep, #0e9f9b);
          margin-top: 2px;
        }
        .hihi-lb-podium-box {
          width: 100%;
          border-radius: 14px 14px 8px 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 1.15rem;
          margin-top: 8px;
          border: 2.5px solid var(--color-ink, #1e1e1e);
          box-shadow: var(--shadow-hard-sm, 2px 2px 0 0 #1e1e1e);
        }
        .hihi-lb-podium-item.top-1 .hihi-lb-podium-box {
          height: 64px;
          background: var(--color-yellow, #ffc72e);
          color: #1e1e1e;
        }
        .hihi-lb-podium-item.top-2 .hihi-lb-podium-box {
          height: 48px;
          background: var(--color-surface, #ffffff);
          color: var(--color-ink, #1e1e1e);
        }
        .hihi-lb-podium-item.top-3 .hihi-lb-podium-box {
          height: 38px;
          background: #ffad85;
          color: #1e1e1e;
        }

        /* ROWS LIST */
        .hihi-lb-list { display: flex; flex-direction: column; gap: 10px; }
        .hihi-lb-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 16px;
          background: var(--color-surface, #ffffff);
          color: var(--color-ink, #1e1e1e);
          border: 2px solid var(--color-ink, #1e1e1e);
          box-shadow: var(--shadow-hard-sm, 2px 2px 0 0 #1e1e1e);
          transition: transform 0.12s ease;
        }
        .hihi-lb-row:hover { transform: translate(-1px, -1px); }
        .hihi-lb-row.me {
          background: var(--color-yellow, #ffc72e);
          color: #1e1e1e;
          border-width: 2.5px;
        }
        .hihi-lb-rank {
          width: 32px;
          font-weight: 800;
          font-size: 0.95rem;
          text-align: center;
          color: var(--color-muted, #40484f);
          flex-shrink: 0;
        }
        .hihi-lb-row.me .hihi-lb-rank { color: #1e1e1e; }
        .hihi-lb-rank.r1, .hihi-lb-rank.r2, .hihi-lb-rank.r3 { font-size: 1.25rem; }
        .hihi-lb-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          object-fit: cover;
          background: var(--color-surface2, #efeee8);
          flex-shrink: 0;
          border: 2px solid var(--color-ink, #1e1e1e);
        }
        .hihi-lb-user-info { flex: 1; min-width: 0; }
        .hihi-lb-user-name {
          font-size: 0.9rem;
          font-weight: 800;
          color: var(--color-ink, #1e1e1e);
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }
        .hihi-lb-row.me .hihi-lb-user-name { color: #1e1e1e; }
        .hihi-lb-tag-me {
          font-size: 0.68rem;
          padding: 2px 8px;
          border-radius: 999px;
          background: #1e1e1e;
          color: #ffc72e;
          font-weight: 800;
        }
        .hihi-lb-level-badge {
          font-size: 0.68rem;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1.5px solid #1e1e1e;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .hihi-lb-breakdown {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 6px;
          font-size: 0.72rem;
        }
        .hihi-lb-sub-tag {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 2px 8px;
          border-radius: 8px;
          background: var(--color-surface2, #efeee8);
          color: var(--color-ink, #1e1e1e);
          border: 1.5px solid var(--color-ink, #1e1e1e);
          font-weight: 700;
        }
        .hihi-lb-row.me .hihi-lb-sub-tag {
          background: #ffffff;
          color: #1e1e1e;
          border-color: #1e1e1e;
        }
        .hihi-lb-score-col {
          text-align: right;
          flex-shrink: 0;
        }
        .hihi-lb-score-main {
          font-size: 1.1rem;
          font-weight: 900;
          color: var(--color-cyan-deep, #0e9f9b);
        }
        .hihi-lb-row.me .hihi-lb-score-main { color: #1e1e1e; }
        .hihi-lb-score-label {
          font-size: 0.66rem;
          color: var(--color-muted, #40484f);
          text-transform: uppercase;
          font-weight: 800;
        }
        .hihi-lb-row.me .hihi-lb-score-label { color: #1e1e1e; }
        .hihi-lb-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--color-muted, #40484f);
          font-weight: 700;
        }

        /* FOOTER */
        .hihi-lb-footer {
          padding: 12px 20px;
          background: var(--color-surface2, #efeee8);
          border-top: 2px solid var(--color-ink, #1e1e1e);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 0.76rem;
          font-weight: 700;
          color: var(--color-muted, #40484f);
        }
      `;
      document.head.appendChild(style);
    }

    // Dọn dẹp floating button cũ nếu còn sót từ cache/inline script
    const oldFloatBtn = document.getElementById('hihiFloatingLbBtn');
    if (oldFloatBtn) oldFloatBtn.remove();

    // INJECT MODAL HTML NẾU CHƯA CÓ
    if (!document.getElementById('hihiLeaderboardModal')) {
      const modal = document.createElement('div');
      modal.id = 'hihiLeaderboardModal';
      modal.className = 'hihi-lb-modal-backdrop';
      modal.innerHTML = `
        <div class="hihi-lb-modal-box" onclick="event.stopPropagation()">
          <div class="hihi-lb-modal-header">
            <div class="hihi-lb-title">
              <span class="hihi-lb-title-icon">${SVG_TROPHY}</span>
              <span>Bảng Xếp Hạng HiHi Study</span>
            </div>
            <div class="hihi-lb-actions">
              <button type="button" class="hihi-lb-btn-icon" onclick="window.hihiLeaderboard.refresh()" title="Làm mới dữ liệu" aria-label="Làm mới bảng xếp hạng">
                ${SVG_REFRESH}
              </button>
              <button type="button" class="hihi-lb-btn-icon" onclick="window.hihiLeaderboard.close()" title="Đóng" aria-label="Đóng bảng xếp hạng">
                ${SVG_CLOSE}
              </button>
            </div>
          </div>

          <div class="hihi-lb-filter-area">
            <div class="hihi-lb-pill-group">
              <span class="hihi-lb-filter-label">Kỳ:</span>
              <button type="button" class="hihi-lb-pill active" data-period="all" onclick="window.hihiLeaderboard.setPeriod('all', this)">🌐 Toàn thời gian</button>
              <button type="button" class="hihi-lb-pill" data-period="week" onclick="window.hihiLeaderboard.setPeriod('week', this)">📅 Tuần này</button>
              <button type="button" class="hihi-lb-pill" data-period="month" onclick="window.hihiLeaderboard.setPeriod('month', this)">🗓️ Theo tháng</button>
              <span id="hihiLbMonthWrap" class="hihi-lb-month-wrap">
                <select id="hihiLbMonthSelect" class="hihi-lb-month-select" aria-label="Chọn tháng" onchange="window.hihiLeaderboard.setMonth(this.value)"></select>
              </span>
            </div>

            <div class="hihi-lb-pill-group">
              <span class="hihi-lb-filter-label">Môn:</span>
              <button type="button" class="hihi-lb-pill active" data-subject="total" onclick="window.hihiLeaderboard.setSubject('total', this)">⭐ Toàn Hệ Thống</button>
              <button type="button" class="hihi-lb-pill" data-subject="tuvung" onclick="window.hihiLeaderboard.setSubject('tuvung', this)">📖 Từ Vựng</button>
              <button type="button" class="hihi-lb-pill" data-subject="chinhta" onclick="window.hihiLeaderboard.setSubject('chinhta', this)">⌨️ Chính Tả</button>
              <button type="button" class="hihi-lb-pill" data-subject="dich" onclick="window.hihiLeaderboard.setSubject('dich', this)">🌐 Luyện Dịch</button>
              <button type="button" class="hihi-lb-pill" data-subject="bamhuyet" onclick="window.hihiLeaderboard.setSubject('bamhuyet', this)">🩺 Bấm Huyệt</button>
            </div>

            <input type="text" class="hihi-lb-search-input" placeholder="Tìm kiếm học viên theo tên..." oninput="window.hihiLeaderboard.onSearch(this.value)">
          </div>

          <div class="hihi-lb-body" id="hihiLbModalBody">
            <div class="hihi-lb-empty">
              <div style="margin-bottom:10px;">${SVG_SPINNER}</div>
              <div>Đang tải bảng xếp hạng toàn hệ thống...</div>
            </div>
          </div>

          <div class="hihi-lb-footer">
            <span id="hihiLbStatusText">Hệ thống đồng bộ trực tiếp • 0 học viên</span>
            <span style="color:var(--color-ink, #1e1e1e);font-weight:800;">HiHi Study</span>
          </div>
        </div>
      `;
      modal.onclick = () => window.hihiLeaderboard.close();
      document.body.appendChild(modal);
      populateMonthOptions();
    }
  }

  // --- RENDER GIAO DIỆN CHÍNH ---
  function renderLeaderboardView(containerEl) {
    if (!containerEl) return;
    const users = cachedUsers || [];

    let filtered = users.filter(u => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return !!(u.displayName && u.displayName.toLowerCase().includes(q));
    });

    const ranked = filtered.map(u => {
      const score = computeUserScore(u, currentPeriod, currentSubject, currentMonth);
      return { ...u, activeScore: score };
    });

    ranked.sort((a, b) => b.activeScore - a.activeScore);

    const currentUid = (window.currentUser && window.currentUser.uid) ||
      (window.hihiCurrentUser && window.hihiCurrentUser.uid) ||
      (window.hihiCurrentUserData && window.hihiCurrentUserData.uid) ||
      (function () {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('firebase:authUser:')) {
              const obj = JSON.parse(localStorage.getItem(k));
              return obj && obj.uid ? obj.uid : null;
            }
          }
        } catch (e) {}
        return null;
      })();

    const statusEl = document.getElementById('hihiLbStatusText');
    if (statusEl) {
      const periodNote = currentPeriod === 'month' ? ` • ${formatMonthLabel(currentMonth)}` : '';
      statusEl.textContent = `Hiển thị ${ranked.length} học viên${periodNote} • Đồng bộ toàn hệ thống`;
    }

    if (ranked.length === 0) {
      containerEl.innerHTML = `
        <div class="hihi-lb-empty">
          <div style="font-size:2rem;margin-bottom:10px;">🏅</div>
          <div>Chưa có điểm nào được ghi nhận cho bộ lọc này.</div>
          <div style="font-size:0.82rem;opacity:0.8;margin-top:4px;">Hãy học bài và là người đầu tiên ghi danh!</div>
        </div>
      `;
      return;
    }

    let podiumHtml = '';
    if (ranked.length >= 2 && !searchQuery) {
      const top1 = ranked[0];
      const top2 = ranked[1];
      const top3 = ranked[2] || null;
      const unit = currentSubject === 'bamhuyet' ? ' ngày' : ' XP';

      podiumHtml = `
        <div class="hihi-lb-podium">
          <div class="hihi-lb-podium-item top-2">
            <div class="hihi-lb-podium-avatar-wrap">
              <img src="${escapeHtml(sanitizePhotoUrl(top2.photoURL))}" class="hihi-lb-podium-avatar" alt="Top 2">
            </div>
            <div class="hihi-lb-podium-name">${escapeHtml(top2.displayName)}</div>
            <div class="hihi-lb-podium-score">${top2.activeScore.toLocaleString()}${unit}</div>
            <div class="hihi-lb-podium-box">2</div>
          </div>

          <div class="hihi-lb-podium-item top-1">
            <div class="hihi-lb-podium-avatar-wrap">
              <span class="hihi-lb-podium-crown">${SVG_CROWN}</span>
              <img src="${escapeHtml(sanitizePhotoUrl(top1.photoURL))}" class="hihi-lb-podium-avatar" alt="Top 1">
            </div>
            <div class="hihi-lb-podium-name">${escapeHtml(top1.displayName)}</div>
            <div class="hihi-lb-podium-score" style="color:var(--color-ink, #1e1e1e);">${top1.activeScore.toLocaleString()}${unit}</div>
            <div class="hihi-lb-podium-box">1</div>
          </div>

          ${top3 ? `
          <div class="hihi-lb-podium-item top-3">
            <div class="hihi-lb-podium-avatar-wrap">
              <img src="${escapeHtml(sanitizePhotoUrl(top3.photoURL))}" class="hihi-lb-podium-avatar" alt="Top 3">
            </div>
            <div class="hihi-lb-podium-name">${escapeHtml(top3.displayName)}</div>
            <div class="hihi-lb-podium-score">${top3.activeScore.toLocaleString()}${unit}</div>
            <div class="hihi-lb-podium-box">3</div>
          </div>
          ` : ''}
        </div>
      `;
    }

    let rowsHtml = '<div class="hihi-lb-list">';

    ranked.forEach((u, idx) => {
      const rank = idx + 1;
      const isMe = currentUid && (u.uid === currentUid || u.id === currentUid);

      let rankClass = '';
      let badge = `${rank}`;
      if (rank === 1) { rankClass = 'r1'; badge = '🥇'; }
      else if (rank === 2) { rankClass = 'r2'; badge = '🥈'; }
      else if (rank === 3) { rankClass = 'r3'; badge = '🥉'; }

      const level = getLevelBadge(u.total_score);

      rowsHtml += `
        <div class="hihi-lb-row ${isMe ? 'me' : ''}">
          <div class="hihi-lb-rank ${rankClass}">${escapeHtml(badge)}</div>
          <img src="${escapeHtml(sanitizePhotoUrl(u.photoURL))}" class="hihi-lb-avatar" alt="Avatar">
          <div class="hihi-lb-user-info">
            <div class="hihi-lb-user-name">
              <span>${escapeHtml(u.displayName)}</span>
              ${isMe ? '<span class="hihi-lb-tag-me">Bạn</span>' : ''}
              <span class="hihi-lb-level-badge" style="color:${level.fg};background:${level.bg};">
                <span>${escapeHtml(level.emoji)}</span> ${escapeHtml(level.label)}
              </span>
            </div>
            <div class="hihi-lb-breakdown">
              <span class="hihi-lb-sub-tag" title="Điểm Từ Vựng">📖 ${(u.tuvung_score || 0).toLocaleString()}</span>
              <span class="hihi-lb-sub-tag" title="Điểm Chính Tả">⌨️ ${(u.chinhta_score || 0).toLocaleString()}</span>
              <span class="hihi-lb-sub-tag" title="Điểm Luyện Dịch">🌐 ${(u.dich_score || 0).toLocaleString()}</span>
              <span class="hihi-lb-sub-tag" title="Chuỗi Điểm Danh Bấm Huyệt">🩺 ${u.streak || 0} ngày</span>
            </div>
          </div>
          <div class="hihi-lb-score-col">
            <div class="hihi-lb-score-main">${u.activeScore.toLocaleString()}</div>
            <div class="hihi-lb-score-label">${currentSubject === 'bamhuyet' ? 'NGÀY' : 'XP'}</div>
          </div>
        </div>
      `;
    });

    rowsHtml += '</div>';
    containerEl.innerHTML = podiumHtml + rowsHtml;
  }

  // --- CONTROLLER CHÍNH ---
  const controller = {
    open: async function () {
      injectStylesAndModal();
      const modal = document.getElementById('hihiLeaderboardModal');
      if (modal) modal.classList.add('active');
      document.body.style.overflow = 'hidden';

      const bodyEl = document.getElementById('hihiLbModalBody');
      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="hihi-lb-empty">
            <div style="margin-bottom:10px;">${SVG_SPINNER}</div>
            <div>Đang tải Bảng Vàng HiHi Study...</div>
          </div>
        `;
      }

      await fetchLeaderboardData(false);
      renderLeaderboardView(bodyEl);
    },

    close: function () {
      const modal = document.getElementById('hihiLeaderboardModal');
      if (modal) modal.classList.remove('active');
      document.body.style.overflow = '';
    },

    refresh: async function () {
      const icon = document.getElementById('hihiLbRefreshIcon');
      if (icon) icon.classList.add('hihi-lb-spin');
      const bodyEl = document.getElementById('hihiLbModalBody');
      await fetchLeaderboardData(true);
      if (icon) icon.classList.remove('hihi-lb-spin');
      renderLeaderboardView(bodyEl);
    },

    setPeriod: function (period, btn) {
      currentPeriod = period;
      document.querySelectorAll('#hihiLeaderboardModal [data-period]').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      const monthWrap = document.getElementById('hihiLbMonthWrap');
      if (monthWrap) monthWrap.classList.toggle('visible', period === 'month');
      renderLeaderboardView(document.getElementById('hihiLbModalBody'));
    },

    setMonth: function (monthStr) {
      if (monthStr) currentMonth = monthStr;
      renderLeaderboardView(document.getElementById('hihiLbModalBody'));
    },

    setSubject: function (subject, btn) {
      currentSubject = subject;
      document.querySelectorAll('#hihiLeaderboardModal [data-subject]').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      renderLeaderboardView(document.getElementById('hihiLbModalBody'));
    },

    onSearch: function (val) {
      searchQuery = val ? val.trim() : '';
      renderLeaderboardView(document.getElementById('hihiLbModalBody'));
    },

    renderInline: async function (containerId) {
      injectStylesAndModal();
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = `<div class="hihi-lb-empty">${SVG_SPINNER}<div style="margin-top:8px;">Đang tải Bảng Xếp Hạng...</div></div>`;
      await fetchLeaderboardData(false);
      renderLeaderboardView(el);
    },

    getUsers: function () {
      return cachedUsers || [];
    }
  };

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const modal = document.getElementById('hihiLeaderboardModal');
      if (modal && modal.classList.contains('active')) controller.close();
    }
  });

  // EXPOSE GLOBAL API
  window.hihiLeaderboard = controller;
  window.hihiOpenLeaderboard = controller.open;
  window.hihiCloseLeaderboard = controller.close;
  window.hihiRefreshLeaderboard = controller.refresh;

  // Tự động inject DOM khi trang sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStylesAndModal);
  } else {
    injectStylesAndModal();
  }
})();

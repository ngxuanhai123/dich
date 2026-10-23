/**
 * HIHI STUDY - UNIFIED LEADERBOARD SYSTEM (hihi-leaderboard.js)
 * Bảng Xếp Hạng Toàn Hệ Sinh Thái - Đồng nhất, nhận diện đầy đủ mọi trang
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

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
      // 1. Tải song song hihi_leaderboard và legacy leaderboard
      const [resHihi, resLegacy] = await Promise.allSettled([
        fetch(`${FIRESTORE_BASE}/hihi_leaderboard`),
        fetch(`${FIRESTORE_BASE}/leaderboard`)
      ]);

      const userMap = new Map();

      // Parse hihi_leaderboard
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
                photoURL: u.photoURL || '',
                email: u.email || '',
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

      // Merge legacy leaderboard nếu có người dùng chưa chuyển đổi
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
                photoURL: leg.photoURL || '',
                email: leg.email || '',
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
              // Bổ sung điểm legacy vào tuvung nếu chưa có
              const existing = userMap.get(leg.id);
              if (!existing.tuvung_score && legScore > 0) {
                existing.tuvung_score = legScore;
                existing.total_score = Math.max(existing.total_score, legScore);
              }
            }
          });
        }
      }

      // 2. Chuyển map thành mảng
      cachedUsers = Array.from(userMap.values());
      cacheTimestamp = now;

      // Cập nhật biến toàn cục
      window.hihiCachedLeaderboardUsers = cachedUsers;
      return cachedUsers;
    } catch (e) {
      console.warn('[HiHi Leaderboard] Lỗi nạp dữ liệu:', e);
      if (cachedUsers) return cachedUsers;
      return [];
    }
  }

  // --- TÍNH TOÁN ĐIỂM THEO BỘ LỌC KỲ VÀ MÔN ---
  function computeUserScore(u, period, subject, targetMonth) {
    const currWeek = getWeekKey();
    const currMonth = targetMonth || getMonthKey();

    // 1. Lọc theo môn học
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

    // 2. Mặc định 'total' (Toàn hệ thống)
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
    if (score >= 10000) return { label: 'Huyền thoại', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: 'fas fa-crown' };
    if (score >= 5000) return { label: 'Đại sư', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: 'fas fa-gem' };
    if (score >= 2000) return { label: 'Cao thủ', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', icon: 'fas fa-shield-alt' };
    if (score >= 500) return { label: 'Chăm chỉ', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: 'fas fa-book-reader' };
    return { label: 'Tân binh', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', icon: 'fas fa-seedling' };
  }

  // --- INJECT CSS & MODAL HTML NẾU CHƯA CÓ ---
  function injectStylesAndModal() {
    if (document.getElementById('hihi-leaderboard-styles')) return;

    const style = document.createElement('style');
    style.id = 'hihi-leaderboard-styles';
    style.textContent = `
      /* FLOATING TRIGGER BUTTON */
      #hihiFloatingLbBtn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9998;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 18px;
        background: linear-gradient(135deg, #0ea5e9, #3b82f6);
        color: #ffffff;
        font-family: 'Be Vietnam Pro', system-ui, sans-serif;
        font-size: 0.85rem;
        font-weight: 700;
        border-radius: 999px;
        box-shadow: 0 4px 20px rgba(14, 165, 233, 0.45);
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.3);
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
        user-select: none;
      }
      #hihiFloatingLbBtn:hover {
        transform: translateY(-2px) scale(1.04);
        box-shadow: 0 8px 28px rgba(14, 165, 233, 0.65);
      }
      #hihiFloatingLbBtn i { font-size: 1.05rem; color: #fef08a; }

      /* MODAL BACKDROP */
      .hihi-lb-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.82);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        padding: 16px;
        opacity: 0;
        transition: opacity 0.25s ease;
      }
      .hihi-lb-modal-backdrop.active {
        display: flex;
        opacity: 1;
      }

      /* MODAL CONTAINER */
      .hihi-lb-modal-box {
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 24px;
        width: 100%;
        max-width: 680px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(14, 165, 233, 0.2);
        overflow: hidden;
        font-family: 'Be Vietnam Pro', system-ui, -apple-system, sans-serif;
        animation: hihiLbPop 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes hihiLbPop {
        0% { transform: scale(0.94) translateY(10px); opacity: 0; }
        100% { transform: scale(1) translateY(0); opacity: 1; }
      }

      /* HEADER */
      .hihi-lb-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(30, 41, 59, 0.6);
      }
      .hihi-lb-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 1.15rem;
        font-weight: 800;
        color: #f8fafc;
      }
      .hihi-lb-title i { color: #f59e0b; font-size: 1.25rem; }
      .hihi-lb-actions { display: flex; align-items: center; gap: 8px; }
      .hihi-lb-btn-icon {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #94a3b8;
        width: 34px;
        height: 34px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: 0.15s;
      }
      .hihi-lb-btn-icon:hover { background: rgba(255, 255, 255, 0.18); color: #fff; }

      /* FILTERS */
      .hihi-lb-filter-area {
        padding: 14px 20px 10px;
        background: rgba(15, 23, 42, 0.95);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .hihi-lb-pill-group {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }
      .hihi-lb-pill {
        padding: 6px 14px;
        font-size: 0.75rem;
        font-weight: 700;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.04);
        color: #94a3b8;
        cursor: pointer;
        transition: 0.15s;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .hihi-lb-pill:hover { background: rgba(255, 255, 255, 0.1); color: #f8fafc; }
      .hihi-lb-pill.active {
        background: linear-gradient(135deg, #0ea5e9, #2563eb);
        color: #fff;
        border-color: #38bdf8;
        box-shadow: 0 2px 10px rgba(14, 165, 233, 0.4);
      }
      .hihi-lb-search-input {
        background: rgba(30, 41, 59, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 6px 12px;
        font-size: 0.8rem;
        color: #fff;
        outline: none;
        width: 100%;
        transition: border-color 0.2s;
      }
      .hihi-lb-search-input:focus { border-color: #38bdf8; }

      /* CONTENT BODY */
      .hihi-lb-body {
        padding: 16px 20px;
        overflow-y: auto;
        flex: 1;
      }

      /* PODIUM STAGES (TOP 1, 2, 3) */
      .hihi-lb-podium {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 12px;
        margin-bottom: 24px;
        padding-top: 10px;
      }
      .hihi-lb-podium-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        width: clamp(80px, 28vw, 120px);
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
        border: 3px solid #64748b;
        background: #1e293b;
      }
      .hihi-lb-podium-item.top-1 .hihi-lb-podium-avatar { width: 68px; height: 68px; border-color: #f59e0b; box-shadow: 0 0 20px rgba(245, 158, 11, 0.45); }
      .hihi-lb-podium-item.top-2 .hihi-lb-podium-avatar { border-color: #94a3b8; box-shadow: 0 0 15px rgba(148, 163, 184, 0.3); }
      .hihi-lb-podium-item.top-3 .hihi-lb-podium-avatar { border-color: #d97706; box-shadow: 0 0 15px rgba(217, 119, 6, 0.3); }
      .hihi-lb-podium-crown {
        position: absolute;
        top: -12px;
        left: 50%;
        transform: translateX(-50%);
        color: #f59e0b;
        font-size: 1.1rem;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
      }
      .hihi-lb-podium-name {
        font-size: 0.8rem;
        font-weight: 700;
        color: #f8fafc;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hihi-lb-podium-score {
        font-size: 0.75rem;
        font-weight: 800;
        color: #38bdf8;
      }
      .hihi-lb-podium-box {
        width: 100%;
        border-radius: 12px 12px 4px 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 1.1rem;
        color: #fff;
        margin-top: 6px;
      }
      .hihi-lb-podium-item.top-1 .hihi-lb-podium-box { height: 65px; background: linear-gradient(180deg, rgba(245, 158, 11, 0.4), rgba(245, 158, 11, 0.1)); border-top: 2px solid #f59e0b; }
      .hihi-lb-podium-item.top-2 .hihi-lb-podium-box { height: 48px; background: linear-gradient(180deg, rgba(148, 163, 184, 0.4), rgba(148, 163, 184, 0.1)); border-top: 2px solid #94a3b8; }
      .hihi-lb-podium-item.top-3 .hihi-lb-podium-box { height: 38px; background: linear-gradient(180deg, rgba(217, 119, 6, 0.4), rgba(217, 119, 6, 0.1)); border-top: 2px solid #d97706; }

      /* ROWS LIST */
      .hihi-lb-list { display: flex; flex-direction: column; gap: 8px; }
      .hihi-lb-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-radius: 16px;
        background: rgba(30, 41, 59, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.05);
        transition: transform 0.15s, background 0.15s;
      }
      .hihi-lb-row:hover { background: rgba(30, 41, 59, 0.7); transform: translateX(3px); }
      .hihi-lb-row.me {
        background: rgba(14, 165, 233, 0.15);
        border: 1px solid rgba(56, 189, 248, 0.4);
        box-shadow: 0 0 15px rgba(14, 165, 233, 0.15);
      }
      .hihi-lb-rank {
        width: 32px;
        font-weight: 800;
        font-size: 0.95rem;
        text-align: center;
        color: #94a3b8;
        flex-shrink: 0;
      }
      .hihi-lb-rank.r1 { color: #f59e0b; font-size: 1.25rem; }
      .hihi-lb-rank.r2 { color: #cbd5e1; font-size: 1.15rem; }
      .hihi-lb-rank.r3 { color: #d97706; font-size: 1.1rem; }
      .hihi-lb-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
        background: #1e293b;
        flex-shrink: 0;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .hihi-lb-user-info { flex: 1; min-width: 0; }
      .hihi-lb-user-name {
        font-size: 0.88rem;
        font-weight: 700;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hihi-lb-tag-me {
        font-size: 0.65rem;
        padding: 2px 6px;
        border-radius: 6px;
        background: #0284c7;
        color: #fff;
        font-weight: 700;
      }
      .hihi-lb-breakdown {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 4px;
        font-size: 0.68rem;
      }
      .hihi-lb-sub-tag {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 1px 6px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.05);
        color: #cbd5e1;
      }
      .hihi-lb-score-col {
        text-align: right;
        flex-shrink: 0;
      }
      .hihi-lb-score-main {
        font-size: 1.05rem;
        font-weight: 900;
        color: #38bdf8;
      }
      .hihi-lb-score-label {
        font-size: 0.65rem;
        color: #94a3b8;
        text-transform: uppercase;
        font-weight: 600;
      }

      /* FOOTER */
      .hihi-lb-footer {
        padding: 12px 20px;
        background: rgba(30, 41, 59, 0.6);
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.75rem;
        color: #94a3b8;
      }
    `;
    document.head.appendChild(style);

    // INJECT MODAL HTML
    if (!document.getElementById('hihiLeaderboardModal')) {
      const modal = document.createElement('div');
      modal.id = 'hihiLeaderboardModal';
      modal.className = 'hihi-lb-modal-backdrop';
      modal.innerHTML = `
        <div class="hihi-lb-modal-box" onclick="event.stopPropagation()">
          <div class="hihi-lb-modal-header">
            <div class="hihi-lb-title">
              <i class="fas fa-trophy"></i>
              <span>Bảng Xếp Hạng HiHi Study</span>
            </div>
            <div class="hihi-lb-actions">
              <button class="hihi-lb-btn-icon" onclick="window.hihiLeaderboard.refresh()" title="Làm mới dữ liệu">
                <i class="fas fa-sync-alt" id="hihiLbRefreshIcon"></i>
              </button>
              <button class="hihi-lb-btn-icon" onclick="window.hihiLeaderboard.close()" title="Đóng">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>

          <div class="hihi-lb-filter-area">
            <!-- Kỳ thời gian -->
            <div class="hihi-lb-pill-group">
              <span style="font-size:0.75rem;color:#94a3b8;font-weight:700;margin-right:4px;">Kỳ:</span>
              <button class="hihi-lb-pill active" data-period="all" onclick="window.hihiLeaderboard.setPeriod('all', this)">🌐 Toàn thời gian</button>
              <button class="hihi-lb-pill" data-period="week" onclick="window.hihiLeaderboard.setPeriod('week', this)">📅 Tuần này</button>
              <button class="hihi-lb-pill" data-period="month" onclick="window.hihiLeaderboard.setPeriod('month', this)">🗓️ Tháng này</button>
            </div>

            <!-- Môn học -->
            <div class="hihi-lb-pill-group">
              <span style="font-size:0.75rem;color:#94a3b8;font-weight:700;margin-right:4px;">Môn:</span>
              <button class="hihi-lb-pill active" data-subject="total" onclick="window.hihiLeaderboard.setSubject('total', this)">⭐ Toàn Hệ Thống</button>
              <button class="hihi-lb-pill" data-subject="tuvung" onclick="window.hihiLeaderboard.setSubject('tuvung', this)">📖 Từ Vựng</button>
              <button class="hihi-lb-pill" data-subject="chinhta" onclick="window.hihiLeaderboard.setSubject('chinhta', this)">⌨️ Chính Tả</button>
              <button class="hihi-lb-pill" data-subject="dich" onclick="window.hihiLeaderboard.setSubject('dich', this)">🌐 Luyện Dịch</button>
              <button class="hihi-lb-pill" data-subject="bamhuyet" onclick="window.hihiLeaderboard.setSubject('bamhuyet', this)">🩺 Bấm Huyệt</button>
            </div>

            <!-- Tìm kiếm -->
            <input type="text" class="hihi-lb-search-input" placeholder="🔍 Tìm kiếm học viên theo tên..." oninput="window.hihiLeaderboard.onSearch(this.value)">
          </div>

          <div class="hihi-lb-body" id="hihiLbModalBody">
            <div style="text-align:center;padding:40px;color:#94a3b8;">
              <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;margin-bottom:10px;"></i>
              <div>Đang tải bảng xếp hạng toàn hệ thống...</div>
            </div>
          </div>

          <div class="hihi-lb-footer">
            <span id="hihiLbStatusText">Hệ thống đồng bộ trực tiếp • 0 học viên</span>
            <span style="color:#38bdf8;font-weight:700;">HiHi Study v2.0</span>
          </div>
        </div>
      `;
      modal.onclick = () => window.hihiLeaderboard.close();
      document.body.appendChild(modal);
    }

    // INJECT FLOATING BUTTON NẾU CHƯA CÓ VÀ KHÔNG PHẢI TRANG CÓ THANH NAV RIÊNG
    if (!document.getElementById('hihiFloatingLbBtn')) {
      const btn = document.createElement('div');
      btn.id = 'hihiFloatingLbBtn';
      btn.innerHTML = `<i class="fas fa-trophy"></i> <span>Bảng Xếp Hạng</span>`;
      btn.title = 'Bấm để mở Bảng Xếp Hạng HiHi Study';
      btn.onclick = () => window.hihiLeaderboard.open();
      document.body.appendChild(btn);
    }
  }

  // --- RENDER GIAO DIỆN CHÍNH ---
  function renderLeaderboardView(containerEl) {
    if (!containerEl) return;
    const users = cachedUsers || [];

    // Lọc theo tìm kiếm
    let filtered = users.filter(u => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (u.displayName && u.displayName.toLowerCase().includes(q)) || (u.email && u.email.toLowerCase().includes(q));
    });

    // Tính điểm và sắp xếp
    const ranked = filtered.map(u => {
      const score = computeUserScore(u, currentPeriod, currentSubject, currentMonth);
      return { ...u, activeScore: score };
    });

    ranked.sort((a, b) => b.activeScore - a.activeScore);

    // Lấy thông tin user hiện tại (SSO)
    const currentUid = (window.currentUser && window.currentUser.uid) ||
                       (window.hihiCurrentUserData && window.hihiCurrentUserData.uid) ||
                       (function() {
                         try {
                           for (let i = 0; i < localStorage.length; i++) {
                             const k = localStorage.key(i);
                             if (k && k.startsWith('firebase:authUser:')) {
                               const obj = JSON.parse(localStorage.getItem(k));
                               return obj.uid;
                             }
                           }
                         } catch(e) {}
                         return null;
                       })();

    const statusEl = document.getElementById('hihiLbStatusText');
    if (statusEl) {
      statusEl.textContent = `Hiển thị ${ranked.length} học viên • Đồng bộ toàn hệ thống`;
    }

    if (ranked.length === 0) {
      containerEl.innerHTML = `
        <div style="text-align:center;padding:40px;color:#94a3b8;">
          <i class="fas fa-medal" style="font-size:2rem;opacity:0.4;margin-bottom:12px;display:block;"></i>
          Chưa có điểm nào được ghi nhận cho bộ lọc này.<br>
          <span style="font-size:0.8rem;opacity:0.7;">Hãy học bài và là người đầu tiên ghi danh!</span>
        </div>
      `;
      return;
    }

    // 1. PODIUM TOP 1, 2, 3
    let podiumHtml = '';
    if (ranked.length >= 2 && !searchQuery) {
      const top1 = ranked[0];
      const top2 = ranked[1];
      const top3 = ranked[2] || null;

      podiumHtml = `
        <div class="hihi-lb-podium">
          <!-- TOP 2 -->
          <div class="hihi-lb-podium-item top-2">
            <div class="hihi-lb-podium-avatar-wrap">
              <img src="${top2.photoURL || 'https://www.gravatar.com/avatar/?d=mp'}" class="hihi-lb-podium-avatar" alt="Top 2">
            </div>
            <div class="hihi-lb-podium-name">${escapeHtml(top2.displayName)}</div>
            <div class="hihi-lb-podium-score">${top2.activeScore.toLocaleString()}</div>
            <div class="hihi-lb-podium-box">2</div>
          </div>

          <!-- TOP 1 -->
          <div class="hihi-lb-podium-item top-1">
            <div class="hihi-lb-podium-avatar-wrap">
              <i class="fas fa-crown hihi-lb-podium-crown"></i>
              <img src="${top1.photoURL || 'https://www.gravatar.com/avatar/?d=mp'}" class="hihi-lb-podium-avatar" alt="Top 1">
            </div>
            <div class="hihi-lb-podium-name">${escapeHtml(top1.displayName)}</div>
            <div class="hihi-lb-podium-score" style="color:#f59e0b;">${top1.activeScore.toLocaleString()}</div>
            <div class="hihi-lb-podium-box">1</div>
          </div>

          <!-- TOP 3 -->
          ${top3 ? `
          <div class="hihi-lb-podium-item top-3">
            <div class="hihi-lb-podium-avatar-wrap">
              <img src="${top3.photoURL || 'https://www.gravatar.com/avatar/?d=mp'}" class="hihi-lb-podium-avatar" alt="Top 3">
            </div>
            <div class="hihi-lb-podium-name">${escapeHtml(top3.displayName)}</div>
            <div class="hihi-lb-podium-score" style="color:#d97706;">${top3.activeScore.toLocaleString()}</div>
            <div class="hihi-lb-podium-box">3</div>
          </div>
          ` : ''}
        </div>
      `;
    }

    // 2. ROWS LIST
    let rowsHtml = '<div class="hihi-lb-list">';
    let meFound = false;

    ranked.forEach((u, idx) => {
      const rank = idx + 1;
      const isMe = currentUid && (u.uid === currentUid || u.id === currentUid);
      if (isMe) meFound = true;

      let rankClass = '';
      let badge = `${rank}`;
      if (rank === 1) { rankClass = 'r1'; badge = '🥇'; }
      else if (rank === 2) { rankClass = 'r2'; badge = '🥈'; }
      else if (rank === 3) { rankClass = 'r3'; badge = '🥉'; }

      const level = getLevelBadge(u.total_score);

      rowsHtml += `
        <div class="hihi-lb-row ${isMe ? 'me' : ''}">
          <div class="hihi-lb-rank ${rankClass}">${badge}</div>
          <img src="${u.photoURL || 'https://www.gravatar.com/avatar/?d=mp'}" class="hihi-lb-avatar" alt="Avatar">
          <div class="hihi-lb-user-info">
            <div class="hihi-lb-user-name">
              <span>${escapeHtml(u.displayName)}</span>
              ${isMe ? '<span class="hihi-lb-tag-me">Bạn</span>' : ''}
              <span style="font-size:0.65rem;font-weight:700;padding:1px 6px;border-radius:4px;color:${level.color};background:${level.bg}">
                <i class="${level.icon}"></i> ${level.label}
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
          <div style="text-align:center;padding:40px;color:#94a3b8;">
            <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;margin-bottom:10px;"></i>
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
      if (icon) icon.classList.add('fa-spin');
      const bodyEl = document.getElementById('hihiLbModalBody');
      await fetchLeaderboardData(true);
      if (icon) icon.classList.remove('fa-spin');
      renderLeaderboardView(bodyEl);
    },

    setPeriod: function (period, btn) {
      currentPeriod = period;
      document.querySelectorAll('[data-period]').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      renderLeaderboardView(document.getElementById('hihiLbModalBody'));
    },

    setSubject: function (subject, btn) {
      currentSubject = subject;
      document.querySelectorAll('[data-subject]').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      renderLeaderboardView(document.getElementById('hihiLbModalBody'));
    },

    onSearch: function (val) {
      searchQuery = val ? val.trim() : '';
      renderLeaderboardView(document.getElementById('hihiLbModalBody'));
    },

    renderInline: async function (containerId) {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> Đang tải Bảng Xếp Hạng...</div>';
      await fetchLeaderboardData(false);
      renderLeaderboardView(el);
    },

    getUsers: function () {
      return cachedUsers || [];
    }
  };

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

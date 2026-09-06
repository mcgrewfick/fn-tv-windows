/* 通用工具 */
window.U = (function () {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(msg, type) {
    const host = document.getElementById('toastHost');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast--error' : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 260);
    }, 2400);
  }

  /** 秒 -> HH:MM:SS 或 MM:SS */
  function fmtTime(sec) {
    if (!sec || sec < 0) return '00:00';
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  /** 秒 -> 1小时23分钟 */
  function fmtDuration(sec) {
    if (!sec) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    if (h > 0) return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
    return `${m} 分钟`;
  }

  function bytes(n) {
    if (!n) return '';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  /** 简单事件代理 */
  function delegate(root, selector, event, handler) {
    root.addEventListener(event, (e) => {
      const t = e.target.closest(selector);
      if (t && root.contains(t)) handler(e, t);
    });
  }

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" width="34" height="34"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
    home: '<svg class="nav-item__icon" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M3 10.5 12 3l9 7.5V21H3z"/></svg>',
    film: '<svg class="nav-item__icon" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M3 4h18v16H3zM8 4v16M16 4v16M3 9h5M16 9h5M3 15h5M16 15h5"/></svg>',
    tv: '<svg class="nav-item__icon" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M3 5h18v11H3zM8 20h8M12 16v4"/></svg>',
    star: '<svg class="nav-item__icon" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m12 3 2.9 5.9 6.1.9-4.5 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.8l6.1-.9z"/></svg>',
    clock: '<svg class="nav-item__icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 7v5.5l3.5 2"/></svg>',
    setting: '<svg class="nav-item__icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3"/></svg>',
    chevronLeft: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 6l-6 6 6 6"/></svg>',
  };

  /** 分辨率标签（4k / 1080p） */
  function resTag(item) {
    const r = item && item.media_stream && item.media_stream.resolutions;
    if (Array.isArray(r) && r.length) {
      const top = r.find((x) => /4k|8k/i.test(x)) || r[0];
      return String(top).toUpperCase();
    }
    return '';
  }

  function isTV(item) {
    if (!item) return false;
    return item.type === 'TV' || item.type === 'Season' || item.type === 'Episode';
  }

  return { esc, toast, fmtTime, fmtDuration, bytes, $, $$, delegate, ICONS, resTag, isTV };
})();

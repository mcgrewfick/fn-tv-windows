/* 播放器悬浮控制层逻辑 */
(function () {
  const $ = (id) => document.getElementById(id);

  const st = {
    duration: 0,
    position: 0,
    paused: false,
    volume: 100,
    muted: false,
    speed: 1,
    tracks: [],
    hwdec: '',
    title: '',
    dragging: false,
    hideTimer: null,
    fullscreen: false,
  };

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  }

  function send(action, payload) {
    return window.fntv.play.control(action, payload);
  }

  /* ---------- 自动隐藏 ---------- */
  function showUI() {
    $('ov').classList.remove('is-hidden');
    clearTimeout(st.hideTimer);
    st.hideTimer = setTimeout(() => {
      if (!st.paused && !$('ovMenu').classList.contains('is-open') && !st.dragging) {
        $('ov').classList.add('is-hidden');
      }
    }, 2600);
  }

  /* ---------- 渲染 ---------- */
  function updateProgress() {
    const pct = st.duration ? Math.min(100, (st.position / st.duration) * 100) : 0;
    $('ovPlayed').style.width = pct + '%';
    $('ovThumb').style.left = pct + '%';
    $('tCur').textContent = fmt(st.position);
    $('tDur').textContent = fmt(st.duration);
  }

  function updatePlayIcon() {
    $('icPlay').style.display = st.paused ? 'block' : 'none';
    $('icPause').style.display = st.paused ? 'none' : 'block';
  }

  /* ---------- 事件 ---------- */
  window.fntv.onMpvEvent(({ channel, payload }) => {
    if (channel === 'property') {
      const { name, value } = payload;
      if (name === 'duration') { st.duration = value || 0; updateProgress(); }
      else if (name === 'time-pos') { st.position = value || 0; if (!st.dragging) updateProgress(); }
      else if (name === 'pause') { st.paused = !!value; updatePlayIcon(); showUI(); }
      else if (name === 'volume') { st.volume = value || 0; $('volRange').value = st.volume; }
      else if (name === 'mute') { st.muted = !!value; }
      else if (name === 'track-list') { st.tracks = value || []; }
      else if (name === 'speed') { st.speed = value || 1; $('btnSpeed').textContent = st.speed.toFixed(2).replace(/0$/, '') + 'x'; }
      else if (name === 'cache-buffering-state') {
        $('ovSpinner').classList.toggle('is-on', (value || 0) < 100 && value !== false);
      }
    } else if (channel === 'hwdec') {
      st.hwdec = payload;
      $('ovHwdec').textContent = '硬解 ' + payload;
    } else if (channel === 'ready') {
      $('ovTitle').textContent = payload && payload.title || '';
    } else if (channel === 'error') {
      const el = $('ovError');
      el.textContent = String(payload || '播放出错');
      el.classList.add('is-on');
    } else if (channel === 'fullscreen') {
      st.fullscreen = !!payload;
    } else if (channel === 'ended') {
      // 播放结束，关闭窗口
      setTimeout(() => window.fntv.play.close(), 800);
    } else if (channel === 'closed') {
      window.fntv.play.close();
    }
  });

  /* ---------- 进度条 ---------- */
  const prog = $('ovProgress');
  function posFromEvent(e) {
    const r = prog.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }
  function showTip(e) {
    const p = posFromEvent(e);
    const tip = $('ovTip');
    tip.textContent = fmt(p * st.duration);
    tip.style.left = (p * 100) + '%';
  }
  prog.addEventListener('mousemove', showTip);
  prog.addEventListener('mousedown', (e) => {
    st.dragging = true;
    showTip(e);
  });
  document.addEventListener('mousemove', (e) => {
    if (st.dragging) {
      const p = posFromEvent(e);
      st.position = p * st.duration;
      updateProgress();
    }
    showUI();
  });
  document.addEventListener('mouseup', (e) => {
    if (!st.dragging) return;
    st.dragging = false;
    const p = posFromEvent(e);
    send('seek', p * st.duration);
  });

  /* ---------- 按钮 ---------- */
  $('btnPlay').addEventListener('click', () => send('togglePause'));
  $('btnBack10').addEventListener('click', () => send('seekRelative', -10));
  $('btnFwd10').addEventListener('click', () => send('seekRelative', 10));
  $('btnBack').addEventListener('click', () => window.fntv.play.close());
  $('btnFull').addEventListener('click', () => send('fullscreen'));

  $('btnMute').addEventListener('click', () => send('mute'));
  $('volRange').addEventListener('input', (e) => send('volume', Number(e.target.value)));

  $('btnSpeed').addEventListener('click', () => {
    const cur = st.speed;
    const idx = SPEEDS.findIndex((s) => Math.abs(s - cur) < 0.01);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    send('speed', next);
    $('btnSpeed').textContent = next + 'x';
  });

  function toggleMenu(kind) {
    const menu = $('ovMenu');
    if (menu.classList.contains('is-open') && menu.dataset.kind === kind) {
      menu.classList.remove('is-open');
      return;
    }
    menu.dataset.kind = kind;
    const isAudio = kind === 'audio';
    const list = st.tracks.filter((t) => t.type === (isAudio ? 'audio' : 'sub'));
    const items = [
      isAudio ? null : `<div class="ov-menu__item" data-v="no">关闭字幕</div>`,
      ...list.map((t) => `
        <div class="ov-menu__item ${t.selected ? 'is-active' : ''}" data-v="${t.id}">
          ${t.lang ? '[' + t.lang + '] ' : ''}${t.title || ('轨道 ' + t.id)}
        </div>`),
    ].filter(Boolean);

    menu.innerHTML = items.length ? items.join('') : '<div class="ov-menu__item">无可用轨道</div>';
    menu.classList.add('is-open');

    menu.onclick = (e) => {
      const it = e.target.closest('.ov-menu__item');
      if (!it) return;
      const v = it.dataset.v;
      send(isAudio ? 'setAudio' : 'setSubtitle', v === 'no' || isAudio ? (isAudio ? Number(v) : v) : Number(v));
      menu.classList.remove('is-open');
    };
  }

  $('btnAudio').addEventListener('click', () => toggleMenu('audio'));
  $('btnSub').addEventListener('click', () => toggleMenu('sub'));

  /* ---------- 双击全屏 / 单击暂停 ---------- */
  let clickTimer = null;
  document.getElementById('ov').addEventListener('click', (e) => {
    if (e.target.closest('.ov-btn') || e.target.closest('.ov-menu') || e.target.closest('.ov-progress')) return;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      send('fullscreen');
    } else {
      clickTimer = setTimeout(() => { clickTimer = null; send('togglePause'); }, 240);
    }
  });

  /* ---------- 键盘 ---------- */
  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case ' ': e.preventDefault(); send('togglePause'); break;
      case 'ArrowLeft': send('seekRelative', -10); break;
      case 'ArrowRight': send('seekRelative', 10); break;
      case 'ArrowUp': send('volume', Math.min(130, st.volume + 5)); break;
      case 'ArrowDown': send('volume', Math.max(0, st.volume - 5)); break;
      case 'f': case 'F': send('fullscreen'); break;
      case 'm': case 'M': send('mute'); break;
      case 'Escape':
        if (st.fullscreen) send('fullscreen', false);
        else window.fntv.play.close();
        break;
    }
    showUI();
  });

  /* ---------- 初始化 ---------- */
  window.fntv.play.setIgnoreMouse(false);
  showUI();
  updateProgress();
})();

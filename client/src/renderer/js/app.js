/* 应用入口：路由、登录流程、设置页 */
window.App = (function () {

  async function boot() {
    bindTitlebar();
    bindSearch();

    window.addEventListener('hashchange', () => {
      const r = State.parseHash();
      State.route = r;
      render();
    });

    // 尝试恢复上次连接
    const restored = await tryRestore();
    if (!restored) {
      LoginView.render();
    }
  }

  async function tryRestore() {
    try {
      const all = await window.fntv.config.all();
      const servers = all.servers || [];
      if (!servers.length) return false;
      const s = servers.find((x) => x.id === all.lastServerId) || servers[0];
      const cred = (all.credentials || {})[s.id];
      if (!cred || !cred.password) return false;

      await window.fntv.auth.login({ url: s.url, username: cred.username, password: cred.password });
      const user = await window.fntv.auth.userInfo();
      State.connected = true;
      State.serverUrl = s.url;
      State.setUser(user);
      document.getElementById('userChip').textContent = user.username || '';
      await afterLogin();
      return true;
    } catch {
      return false;
    }
  }

  async function afterLogin() {
    try {
      const libs = await window.fntv.library.list() || [];
      State.setLibraries(libs);
    } catch (e) {
      U.toast('读取媒体库失败：' + (e.message || ''), 'error');
      State.setLibraries([]);
    }

    const mpvOk = await window.fntv.app.mpvAvailable();
    if (!mpvOk) {
      U.toast('未找到 mpv 播放内核，播放功能不可用', 'error');
    }

    State.renderSidebar();
    const r = State.parseHash();
    State.route = r;
    render();
  }

  function render() {
    const content = document.getElementById('content');
    const r = State.route;

    if (!State.connected) { LoginView.render(); return; }

    State.renderSidebar();
    content.scrollTop = 0;

    switch (r.name) {
      case 'home':
        HomeView.render(content);
        break;
      case 'library':
      case 'continue':
      case 'favorites':
        LibraryView.render(content, r);
        break;
      case 'search':
        SearchView.render(content, r.params.id || '');
        break;
      case 'settings':
        renderSettings(content);
        break;
      default:
        HomeView.render(content);
    }
  }

  /* ---------- 设置页 ---------- */
  async function renderSettings(content) {
    const cfg = (await window.fntv.config.all()).player || {};
    const ver = await window.fntv.app.version();
    const srv = await window.fntv.server.info().catch(() => null);

    content.innerHTML = `
      <h1 class="page-title">播放设置</h1>
      <div class="page-sub">客户端 v${U.esc(ver)} · 服务端 ${U.esc(srv ? '' : '未连接')}</div>

      <div class="detail__section">
        <h4>硬件解码</h4>
        <div class="filters" id="hwFilters">
          ${[
            ['auto', '自动（推荐）'],
            ['d3d11va', 'D3D11 (N卡/A卡/核显)'],
            ['dxva2', 'DXVA2 兼容模式'],
            ['nvdec', 'NVDEC (N卡专用)'],
            ['no', '纯软件解码'],
          ].map(([v, label]) =>
            `<button class="chip ${cfg.hwdec === v ? 'is-active' : ''}" data-v="${v}">${label}</button>`
          ).join('')}
        </div>
        <div class="page-sub" style="margin:0">
          4K 硬解需要显卡支持。若播放异常（花屏/黑屏），可切换为 DXVA2 或纯软件解码。
        </div>
      </div>

      <div class="detail__section">
        <h4>字幕字号</h4>
        <div class="filters" id="fsFilters">
          ${[32, 36, 40, 46, 52].map((v) =>
            `<button class="chip ${cfg.subtitleFontSize === v ? 'is-active' : ''}" data-v="${v}">${v}</button>`
          ).join('')}
        </div>
      </div>

      <div class="detail__section">
        <h4>服务器</h4>
        <div class="page-sub" style="margin-bottom:8px">${U.esc(State.serverUrl || '')}</div>
        <button class="chip" id="btnLogout">切换 / 退出登录</button>
      </div>
    `;

    const bind = (id, key, cast) => {
      U.delegate(document.getElementById(id), '.chip', 'click', async (_e, t) => {
        U.$$('.chip', document.getElementById(id)).forEach((c) => c.classList.remove('is-active'));
        t.classList.add('is-active');
        await window.fntv.config.set('player.' + key, cast(t.dataset.v));
        U.toast('已保存，下次播放生效');
      });
    };
    bind('hwFilters', 'hwdec', String);
    bind('fsFilters', 'subtitleFontSize', Number);

    document.getElementById('btnLogout').addEventListener('click', async () => {
      await window.fntv.auth.logout();
      await window.fntv.config.set('lastServerId', null);
      State.connected = false;
      LoginView.render();
    });
  }

  /* ---------- 标题栏 ---------- */
  function bindTitlebar() {
    document.getElementById('btnMin').addEventListener('click', () => window.fntv.win.minimize());
    document.getElementById('btnMax').addEventListener('click', () => window.fntv.win.maximize());
    document.getElementById('btnClose').addEventListener('click', () => window.fntv.win.close());
  }

  function bindSearch() {
    const input = document.getElementById('searchInput');
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const kw = input.value.trim();
        if (kw.length < 1) return;
        State.route = { name: 'search', params: { id: kw } };
        render();
      }, 380);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const kw = input.value.trim();
        if (kw) { State.route = { name: 'search', params: { id: kw } }; render(); }
      }
    });
  }

  return { boot, render, afterLogin };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.boot();
});

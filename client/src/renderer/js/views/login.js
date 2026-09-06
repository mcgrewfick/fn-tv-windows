/* 登录视图 */
window.LoginView = (function () {
  const DEFAULTS = { url: '', username: '', password: '' };

  async function loadSaved() {
    try {
      const all = await window.fntv.config.all();
      const servers = all.servers || [];
      if (servers.length) {
        const s = servers.find((x) => x.id === all.lastServerId) || servers[0];
        return { url: s.url, username: s.username || '', password: all.credentials?.[s.id]?.password || '' };
      }
    } catch { /* ignore */ }
    return null;
  }

  async function render() {
    const layer = document.getElementById('loginLayer');
    layer.classList.add('is-open');

    const saved = (await loadSaved()) || DEFAULTS;

    layer.innerHTML = `
      <div class="login-card">
        <div class="login-card__logo">
          <svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
        </div>
        <div class="login-card__title">飞牛影视</div>
        <div class="login-card__sub">连接你的影视服务器，本地硬解流畅播放</div>

        <div class="field">
          <label class="field__label">服务器地址</label>
          <input id="lgUrl" type="text" placeholder="http://<NAS-IP>:5666" value="${U.esc(saved.url)}" />
        </div>
        <div class="field">
          <label class="field__label">用户名</label>
          <input id="lgUser" type="text" placeholder="用户名" value="${U.esc(saved.username)}" />
        </div>
        <div class="field">
          <label class="field__label">密码</label>
          <input id="lgPass" type="password" placeholder="请输入密码" value="${U.esc(saved.password)}" />
        </div>

        <button class="btn" id="lgBtn">连接</button>
        <div class="login-error" id="lgErr"></div>
        <div class="login-hint">
          支持 IP / 域名直连 · 视频由本机显卡硬解，不占用 NAS 转码资源
        </div>
      </div>
    `;

    const btn = document.getElementById('lgBtn');
    const err = document.getElementById('lgErr');
    const urlEl = document.getElementById('lgUrl');
    const userEl = document.getElementById('lgUser');
    const passEl = document.getElementById('lgPass');

    const submit = async () => {
      const url = urlEl.value.trim().replace(/\/+$/, '');
      const username = userEl.value.trim();
      const password = passEl.value;
      if (!url) return (err.textContent = '请填写服务器地址');
      if (!/^https?:\/\//i.test(url)) return (err.textContent = '地址需以 http:// 或 https:// 开头');
      if (!username) return (err.textContent = '请填写用户名');

      err.textContent = '';
      btn.disabled = true;
      btn.textContent = '连接中…';

      try {
        await window.fntv.auth.login({ url, username, password });
        const user = await window.fntv.auth.userInfo();

        // 保存服务器与凭据
        const id = url.replace(/[^\w]/g, '_');
        await saveServer(id, url, username, password);

        State.connected = true;
        State.serverUrl = url;
        State.setUser(user);
        document.getElementById('userChip').textContent = user.username || '';
        layer.classList.remove('is-open');

        await App.afterLogin();
      } catch (e) {
        err.textContent = (e && e.message) || '连接失败，请检查地址与账号密码';
      } finally {
        btn.disabled = false;
        btn.textContent = '连接';
      }
    };

    btn.addEventListener('click', submit);
    [urlEl, userEl, passEl].forEach((el) => {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    });
    setTimeout(() => (passEl.value ? btn : urlEl).focus(), 60);
  }

  async function saveServer(id, url, username, password) {
    const all = await window.fntv.config.all();
    const servers = (all.servers || []).filter((s) => s.id !== id);
    servers.unshift({ id, name: url, url, username });
    await window.fntv.config.set('servers', servers);
    await window.fntv.config.set('lastServerId', id);
    await window.fntv.config.set('credentials.' + id, { username, password });
  }

  return { render };
})();

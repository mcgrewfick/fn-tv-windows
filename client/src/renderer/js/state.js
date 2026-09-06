/* 全局状态与导航 */
window.State = {
  connected: false,
  user: null,
  libraries: [],
  serverUrl: '',
  route: { name: 'home', params: {} },

  setUser(u) { this.user = u; },
  setLibraries(l) { this.libraries = l || []; },

  /**
   * 路由跳转
   * @param {string} name home | library | favorites | continue | search | settings
   */
  navigate(name, params) {
    this.route = { name, params: params || {} };
    const hash = '#' + name + (params && params.id ? '/' + params.id : '');
    if (location.hash !== hash) location.hash = hash;
    else App.render();
  },

  parseHash() {
    const raw = (location.hash || '#home').replace(/^#/, '');
    const [name, id] = raw.split('/');
    return { name: name || 'home', params: { id } };
  },

  /** 侧边栏 */
  renderSidebar() {
    const el = document.getElementById('sidebar');
    if (!el) return;
    const cur = this.route.name + (this.route.params.id ? '/' + this.route.params.id : '');

    const libs = this.libraries.map((l) => {
      const id = 'library/' + l.guid;
      const icon = l.category === 'TV' ? U.ICONS.tv : U.ICONS.film;
      return `<div class="nav-item ${cur === id ? 'is-active' : ''}" data-nav="${id}">
        ${icon}<span class="nav-item__label">${U.esc(l.name)}</span>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="nav-group">
        <div class="nav-item ${cur === 'home' ? 'is-active' : ''}" data-nav="home">
          ${U.ICONS.home}<span class="nav-item__label">首页</span>
        </div>
        <div class="nav-item ${cur === 'continue' ? 'is-active' : ''}" data-nav="continue">
          ${U.ICONS.clock}<span class="nav-item__label">继续观看</span>
        </div>
        <div class="nav-item ${cur === 'favorites' ? 'is-active' : ''}" data-nav="favorites">
          ${U.ICONS.star}<span class="nav-item__label">我的收藏</span>
        </div>
      </div>
      ${libs ? `<div class="nav-group">
        <div class="nav-group__title">媒体库</div>
        ${libs}
      </div>` : ''}
      <div class="nav-group">
        <div class="nav-item ${cur === 'settings' ? 'is-active' : ''}" data-nav="settings">
          ${U.ICONS.setting}<span class="nav-item__label">播放设置</span>
        </div>
      </div>
    `;

    U.delegate(el, '.nav-item', 'click', (_e, t) => {
      const nav = t.dataset.nav || '';
      const [name, id] = nav.split('/');
      this.navigate(name, { id });
    });
  },
};

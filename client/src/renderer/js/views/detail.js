/* 详情抽屉（含剧集列表与播放入口） */
window.DetailView = (function () {
  let current = null;
  let currentSeason = null;

  async function open(guid, opts) {
    opts = opts || {};
    const drawer = document.getElementById('drawer');
    drawer.classList.add('is-open');
    drawer.innerHTML = `
      <div class="drawer__mask" data-close="1"></div>
      <div class="drawer__panel" id="drawerPanel">
        <div style="padding:80px 0"><div class="spinner"></div></div>
      </div>
    `;
    drawer.querySelector('.drawer__mask').addEventListener('click', close);
    document.addEventListener('keydown', onEsc);

    let item;
    try {
      item = await window.fntv.item.info(guid);
    } catch (e) {
      U.toast(e.message || '加载详情失败', 'error');
      close();
      return;
    }
    current = item;
    render(item, opts);
  }

  function onEsc(e) { if (e.key === 'Escape') close(); }

  function close() {
    const drawer = document.getElementById('drawer');
    drawer.classList.remove('is-open');
    drawer.innerHTML = '';
    document.removeEventListener('keydown', onEsc);
    current = null;
  }

  function render(item, opts) {
    const panel = document.getElementById('drawerPanel');
    if (!panel) return;

    const backdrop = item.backdrops || item.posters || '';
    const res = U.resTag(item);
    const isTV = U.isTV(item) || item.number_of_seasons > 0;

    const genres = (item.genres || []).slice(0, 5)
      .map((g) => `<span class="tag">${U.esc(typeof g === 'object' ? (g.name || '') : g)}</span>`).join('');

    panel.innerHTML = `
      <div class="detail__hero">
        ${backdrop ? `<img src="${window.fntv.img(backdrop)}" alt=""/>` : ''}
        <button class="detail__close" data-close="1" title="关闭 (Esc)">
          <svg viewBox="0 0 12 12" width="12" height="12"><path stroke="currentColor" stroke-width="1.4" d="M0 0l12 12M12 0L0 12"/></svg>
        </button>
      </div>

      <div class="detail__body">
        <h2 class="detail__title">${U.esc(item.title || '')}</h2>
        ${item.original_title && item.original_title !== item.title
          ? `<div class="detail__orig">${U.esc(item.original_title)}</div>` : ''}

        <div class="detail__tags">
          ${item.vote_average ? `<span class="tag tag--score">${Number(item.vote_average).toFixed(1)}</span>` : ''}
          ${res ? `<span class="tag tag--res">${U.esc(res)}</span>` : ''}
          ${(item.release_date || item.air_date) ? `<span class="tag">${U.esc((item.release_date || item.air_date).slice(0, 10))}</span>` : ''}
          ${item.runtime ? `<span class="tag">${U.fmtDuration(item.runtime * 60)}</span>` : ''}
          ${genres}
        </div>

        <div class="detail__actions">
          <button class="btn-play" id="btnPlay">${U.ICONS.play.replace('width="34" height="34"', 'width="18" height="18"')}
            ${opts && opts.ts > 30 ? '继续播放' : '播放'}</button>
          <button class="btn-ghost" id="btnFav">${item.is_favorite ? '取消收藏' : '收藏'}</button>
          <button class="btn-ghost" id="btnWatched">${item.is_watched ? '标记未看' : '标记已看'}</button>
        </div>

        ${item.overview ? `
          <div class="detail__section">
            <h4>剧情简介</h4>
            <div class="detail__overview">${U.esc(item.overview)}</div>
          </div>` : ''}

        ${isTV ? `<div class="detail__section" id="epSection">
          <h4>剧集</h4>
          <div class="season-tabs" id="seasonTabs"></div>
          <div class="ep-list" id="epList"><div class="spinner"></div></div>
        </div>` : ''}
      </div>
    `;

    panel.querySelector('[data-close]').addEventListener('click', close);

    panel.querySelector('#btnPlay').addEventListener('click', () => {
      startPlay(item.guid, (opts && opts.ts) || 0, item.title);
    });

    panel.querySelector('#btnFav').addEventListener('click', async () => {
      try {
        await window.fntv.item.setFavorite(item.guid);
        item.is_favorite = item.is_favorite ? 0 : 1;
        U.toast(item.is_favorite ? '已收藏' : '已取消收藏');
        render(item, opts);
      } catch (e) { U.toast(e.message || '操作失败', 'error'); }
    });

    panel.querySelector('#btnWatched').addEventListener('click', async () => {
      try {
        const next = !item.is_watched;
        await window.fntv.item.setWatched(item.guid, next);
        item.is_watched = next ? 1 : 0;
        U.toast(next ? '已标记为已看' : '已标记为未看');
        render(item, opts);
      } catch (e) { U.toast(e.message || '操作失败', 'error'); }
    });

    if (isTV) loadSeasons(item.guid);
  }

  async function loadSeasons(guid) {
    const tabs = document.getElementById('seasonTabs');
    const list = document.getElementById('epList');
    if (!tabs) return;
    try {
      const seasons = (await window.fntv.season.list(guid)) || [];
      if (!seasons.length) {
        // 没有季数据，直接尝试取集
        currentSeason = guid;
      } else {
        currentSeason = seasons[0].guid;
      }
      tabs.innerHTML = seasons.length
        ? seasons.map((s, i) => `<button class="chip ${i === 0 ? 'is-active' : ''}" data-sg="${U.esc(s.guid)}">${U.esc(s.title || ('第 ' + (s.season_number || (i + 1)) + ' 季'))}</button>`).join('')
        : '';
      U.delegate(tabs, '.chip', 'click', (_e, t) => {
        U.$$('.chip', tabs).forEach((c) => c.classList.remove('is-active'));
        t.classList.add('is-active');
        currentSeason = t.dataset.sg;
        loadEpisodes(currentSeason);
      });
      await loadEpisodes(currentSeason);
    } catch (e) {
      list.innerHTML = '<div class="empty">暂无剧集</div>';
    }
  }

  async function loadEpisodes(seasonGuid) {
    const list = document.getElementById('epList');
    if (!list || !seasonGuid) return;
    list.innerHTML = '<div class="spinner"></div>';
    try {
      const eps = (await window.fntv.episode.list(seasonGuid)) || [];
      if (!eps.length) {
        list.innerHTML = '<div class="empty">暂无剧集</div>';
        return;
      }
      list.innerHTML = eps.map((ep) => `
        <div class="ep-item" data-guid="${U.esc(ep.guid)}" data-ts="${ep.ts || 0}">
          <div class="ep-item__thumb">
            ${ep.poster ? `<img loading="lazy" src="${window.fntv.img(ep.poster)}" alt=""/>` : ''}
          </div>
          <div class="ep-item__info">
            <div class="ep-item__title">${U.esc(ep.episode_number ? '第 ' + ep.episode_number + ' 集 ' : '')}${U.esc(ep.title || '')}</div>
            <div class="ep-item__meta">${ep.duration ? U.fmtDuration(ep.duration) : ''}${ep.ts > 30 ? ' · 已看至 ' + U.fmtTime(ep.ts) : ''}</div>
          </div>
        </div>
      `).join('');

      U.delegate(list, '.ep-item', 'click', (_e, t) => {
        startPlay(t.dataset.guid, Number(t.dataset.ts || 0),
          (current ? current.title + ' · ' : '') + (t.querySelector('.ep-item__title')?.textContent || ''));
      });
    } catch (e) {
      list.innerHTML = '<div class="empty">加载失败</div>';
    }
  }

  /** 发起播放：交给主进程拉起 mpv 本地硬解 */
  async function startPlay(guid, ts, title) {
    try {
      U.toast('正在启动播放器…');
      await window.fntv.play.open({ itemGuid: guid, title: title || '', start: ts || 0 });
    } catch (e) {
      U.toast(e && e.message || '播放失败', 'error');
    }
  }

  return { open, close, startPlay };
})();

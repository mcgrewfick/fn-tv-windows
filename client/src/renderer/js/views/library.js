/* 媒体库 / 继续观看 / 收藏 列表页 */
window.LibraryView = (function () {
  const PAGE = 60;

  const state = {
    mode: 'library',      // library | continue | favorites
    libGuid: '',
    start: 0,
    total: 0,
    items: [],
    loading: false,
  };

  async function fetchPage(append) {
    if (state.loading) return;
    state.loading = true;
    try {
      let items = [];
      if (state.mode === 'continue') {
        items = (await window.fntv.play.list({ start: state.start, page_size: PAGE })) || [];
      } else {
        const r = await window.fntv.item.list({
          library_guid: state.libGuid,
          start: state.start,
          page_size: PAGE,
        }) || {};
        items = r.list || [];
        state.total = r.total || 0;
      }
      state.items = append ? state.items.concat(items) : items;
      state.start = state.items.length;
      renderGrid(append);
    } catch (e) {
      U.toast(e.message || '加载失败', 'error');
    } finally {
      state.loading = false;
    }
  }

  function renderGrid(keepScroll) {
    const content = document.getElementById('content');
    const scroller = document.getElementById('gridWrap');
    const moreBtn = document.getElementById('moreBtn');
    if (!scroller) return;

    scroller.innerHTML = state.items.length
      ? state.items.map((i) => window.renderCard(i, {
          title: i.tv_title ? `${i.tv_title} · ${i.title}` : i.title,
          sub: (i.release_date || i.air_date || '').slice(0, 10),
          progress: state.mode === 'continue' && i.duration ? (i.ts || 0) / i.duration : 0,
        })).join('')
      : '<div class="empty">暂无内容</div>';

    if (moreBtn) {
      const hasMore = state.mode === 'continue'
        ? state.items.length > 0 && state.items.length % PAGE === 0
        : state.items.length < state.total;
      moreBtn.style.display = hasMore ? 'block' : 'none';
      moreBtn.textContent = state.loading ? '加载中…' : '加载更多';
    }
    void content; void keepScroll;
  }

  async function render(content, route) {
    state.mode = route.name === 'library' ? 'library' : route.name;
    state.libGuid = route.params.id || '';
    state.start = 0;
    state.items = [];
    state.total = 0;

    const lib = State.libraries.find((l) => l.guid === state.libGuid);
    const title = state.mode === 'continue' ? '继续观看'
      : state.mode === 'favorites' ? '我的收藏'
      : (lib ? lib.name : '媒体库');

    content.innerHTML = `
      <h1 class="page-title">${U.esc(title)}</h1>
      <div class="page-sub" id="libCount">加载中…</div>
      <div class="grid" id="gridWrap"><div class="empty"><div class="spinner"></div></div></div>
      <div style="text-align:center;margin-top:24px">
        <button class="chip" id="moreBtn" style="display:none">加载更多</button>
      </div>
    `;

    window.bindCards(content);

    document.getElementById('moreBtn').addEventListener('click', () => fetchPage(true));

    await fetchPage(false);
    const c = document.getElementById('libCount');
    if (c) {
      c.textContent = state.mode === 'library'
        ? `共 ${state.total || state.items.length} 部`
        : `${state.items.length} 条记录`;
    }
  }

  return { render };
})();

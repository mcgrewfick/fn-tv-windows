/* 首页：继续观看 + 各媒体库推荐 */

/* ---------- 共享卡片组件 ---------- */
window.renderCard = function (item, opts) {
  opts = opts || {};
  const poster = item.poster || item.posters || '';
  const title = opts.title || item.title || item.tv_title || '';
  const sub = opts.sub !== undefined ? opts.sub
    : (item.release_date || item.air_date || '').slice(0, 10) || (item.vote_average ? '' : '');
  const res = U.resTag(item);
  const progress = opts.progress;

  return `
    <div class="card" data-guid="${U.esc(item.guid)}" data-type="${U.esc(item.type || '')}"
         data-media="${U.esc(item.media_guid || '')}" data-title="${U.esc(title)}"
         data-ts="${item.ts || 0}" data-duration="${item.duration || 0}">
      <div class="card__poster">
        ${poster
          ? `<img loading="lazy" src="${window.fntv.img(poster)}" alt="${U.esc(title)}"/>`
          : `<div class="card__poster--empty">${U.esc(title)}</div>`}
        <div class="card__play">${U.ICONS.play}</div>
        ${res ? `<span class="card__badge ${/4k|8k/i.test(res) ? 'card__badge--top' : ''}">${U.esc(res)}</span>` : ''}
        ${progress ? `<div class="card__progress"><i style="width:${Math.min(100, progress * 100)}%"></i></div>` : ''}
      </div>
      <div class="card__title" title="${U.esc(title)}">${U.esc(title)}</div>
      <div class="card__meta">${U.esc(sub)}</div>
    </div>
  `;
};

window.renderRow = function (title, itemsHtml, opts) {
  opts = opts || {};
  const chev = U.ICONS.chevronLeft;
  return `
    <section class="row">
      <div class="row__head">
        <div class="row__title">${U.esc(title)}</div>
        ${opts.more ? `<div class="row__more" data-more="${U.esc(opts.more)}">查看全部 ›</div>` : ''}
      </div>
      <div class="row__scroller-wrap">
        <button class="row__arrow row__arrow--left" data-dir="left" aria-label="向左滑动"><span class="row__arrow-btn">${chev}</span></button>
        <button class="row__arrow row__arrow--right" data-dir="right" aria-label="向右滑动"><span class="row__arrow-btn">${chev}</span></button>
        <div class="row__scroller">${itemsHtml}</div>
      </div>
    </section>
  `;
};

window.HomeView = (function () {
  async function render(content) {
    content.innerHTML = `<div class="loading-wrap"><div class="spinner"></div></div>`;

    let recent = [];
    try { recent = (await window.fntv.play.list({ start: 0, page_size: 20 })) || []; }
    catch { recent = []; }

    const libs = State.libraries || [];

    const sections = [];

    if (recent.length) {
      sections.push(window.renderRow(
        '继续观看',
        recent.map((i) => window.renderCard(i, {
          title: i.tv_title ? `${i.tv_title} · ${i.title}` : i.title,
          sub: U.fmtTime(i.ts) + ' / ' + U.fmtTime(i.duration),
          progress: i.duration ? (i.ts || 0) / i.duration : 0,
        })).join(''),
        { more: 'continue' }
      ));
    }

    for (const lib of libs) {
      let list = [];
      try {
        const r = await window.fntv.item.list({ library_guid: lib.guid, start: 0, page_size: 30 });
        list = (r && r.list) || [];
      } catch { list = []; }
      if (!list.length) continue;
      sections.push(window.renderRow(
        lib.name,
        list.map((i) => window.renderCard(i)).join(''),
        { more: 'library/' + lib.guid }
      ));
    }

    content.innerHTML = `
      <h1 class="page-title">首页</h1>
      <div class="page-sub">共 ${libs.length} 个媒体库 · 本地硬解播放</div>
      ${sections.join('') || '<div class="empty">媒体库里还没有内容</div>'}
    `;

    bindCards(content);
  }

  window.bindCards = function (root) {
    U.delegate(root, '.card', 'click', (e, t) => {
      const guid = t.dataset.guid;
      if (!guid) return;
      DetailView.open(guid, {
        mediaGuid: t.dataset.media || '',
        ts: Number(t.dataset.ts || 0),
        duration: Number(t.dataset.duration || 0),
      });
    });
    U.delegate(root, '.row__more', 'click', (_e, t) => {
      const more = t.dataset.more || '';
      const [name, id] = more.split('/');
      State.navigate(name, { id });
    });
    // 左右箭头：平滑滚动一屏（对齐 Web 端 scrollTo 逻辑）
    U.delegate(root, '.row__arrow', 'click', (_e, t) => {
      const row = t.closest('.row');
      const scroller = row && row.querySelector('.row__scroller');
      if (!scroller) return;
      const dir = t.dataset.dir === 'left' ? -1 : 1;
      const step = scroller.clientWidth - 44 - 84;
      scroller.scrollBy({ left: dir * step, behavior: 'smooth' });
    });
  };

  return { render };
})();

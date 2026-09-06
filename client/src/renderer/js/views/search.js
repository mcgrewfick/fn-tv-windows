/* 搜索结果页 */
window.SearchView = (function () {
  let keyword = '';

  async function render(content, kw) {
    keyword = kw || '';
    content.innerHTML = `
      <h1 class="page-title">搜索：${U.esc(keyword)}</h1>
      <div class="page-sub" id="srCount">搜索中…</div>
      <div class="grid" id="srWrap"><div class="spinner"></div></div>
    `;

    try {
      const r = await window.fntv.search(keyword) || {};
      const list = r.list || r.data || (Array.isArray(r) ? r : []);
      const wrap = document.getElementById('srWrap');
      document.getElementById('srCount').textContent = `找到 ${list.length} 个结果`;
      wrap.innerHTML = list.length
        ? list.map((i) => window.renderCard(i)).join('')
        : '<div class="empty">没有找到相关内容</div>';
      window.bindCards(content);
    } catch (e) {
      document.getElementById('srWrap').innerHTML =
        `<div class="empty">搜索失败：${U.esc(e.message || '')}</div>`;
    }
  }

  return { render };
})();

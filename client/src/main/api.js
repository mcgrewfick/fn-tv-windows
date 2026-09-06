/**
 * 飞牛影视 API 客户端
 *
 * 逆向自飞牛影视 Web 前端（版本 0.9.7）
 * 关键实现：authx 签名算法
 */
const crypto = require('crypto');
const { SECRET, API_KEY } = require('./secrets');

// ========== 常量（逆向自前端 JS） ==========
// secret / api_key 见 ./secrets.js（该文件已 gitignore，不提交公开仓库）
const CLIENT_TYPE = 'Trim-NAS';
const CLIENT_VERSION = '629';
const API_V1 = '/v/api/v1';

function md5(s) {
  return crypto.createHash('md5').update(s, 'utf8').digest('hex');
}

/**
 * 复刻前端 fu()：query 参数按 key 升序排序后编码，'+' 替换为 '%20'
 */
function buildQuery(params = {}) {
  const parts = [];
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v === undefined || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join('&').replace(/\+/g, '%20');
}

/**
 * 复刻前端 gu()：生成 authx 签名
 * raw = [secret, pathname, nonce, timestamp, bodyHash, apiKey].join('_')
 */
function buildAuthx(method, pathname, params, body) {
  const isGet = method.toUpperCase() === 'GET';
  let hash;
  if (isGet) {
    const q = buildQuery(params);
    hash = md5(safeDecode(q));
  } else {
    const s = body === undefined || body === null ? '' : JSON.stringify(body);
    hash = md5(s);
  }
  const nonce = String(Math.floor(Math.random() * 9e5) + 1e5);
  const timestamp = String(Date.now());
  const sign = md5([SECRET, pathname, nonce, timestamp, hash, API_KEY].join('_'));
  return `nonce=${nonce}&timestamp=${timestamp}&sign=${sign}`;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s.replace(/%(?![0-9A-Fa-f]{2})/g, '%25'));
  } catch {
    return s;
  }
}

class FnClientError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class FnClient {
  constructor(baseUrl = '') {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.token = null;
    this._serverInfo = null;
  }

  get apiBase() {
    return this.baseUrl + API_V1;
  }

  /**
   * 统一请求入口
   * @param {string} method
   * @param {string} path 形如 '/login'、'/item/list'
   * @param {{params?: object, body?: object, absolute?: boolean, raw?: boolean}} opts
   */
  async request(method, path, opts = {}) {
    const { params = {}, body = null, absolute = false } = opts;
    const pathname = absolute ? path : API_V1 + path;
    const qs = Object.keys(params).length ? '?' + buildQuery(params) : '';
    const url = (absolute ? path : this.baseUrl + pathname) + qs;

    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Trim-Client': 'web',
      'X-Trim-Client-Version': CLIENT_VERSION,
      'client-type': CLIENT_TYPE,
      authx: buildAuthx(method, pathname, params, body),
    };
    if (this.token) headers['Authorization'] = this.token;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, {
        method: method.toUpperCase(),
        headers,
        body: body === null ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new FnClientError('响应解析失败', -1, res.status);
      }
      if (json && json.code !== undefined && json.code !== 0) {
        throw new FnClientError(json.msg || '请求失败', json.code, res.status);
      }
      if (!res.ok) {
        throw new FnClientError(`HTTP ${res.status}`, -1, res.status);
      }
      return json.data;
    } catch (e) {
      if (e instanceof FnClientError) throw e;
      if (e.name === 'AbortError') throw new FnClientError('请求超时', -2, 0);
      throw new FnClientError(e.message || '网络错误', -3, 0);
    } finally {
      clearTimeout(timer);
    }
  }

  get(path, params) {
    return this.request('GET', path, { params });
  }

  post(path, body, params) {
    return this.request('POST', path, { body, params });
  }

  // ============ 认证 ============

  /** 登录，返回 token */
  async login(username, password) {
    const data = await this.post('/login', { username, password });
    this.token = data && data.token;
    if (!this.token) throw new FnClientError('登录失败：未返回 token', -4, 200);
    return this.token;
  }

  async userInfo() {
    return this.get('/user/info');
  }

  // ============ 服务器 ============

  async serverInfo() {
    const d = await this.get('/server/info');
    this._serverInfo = d;
    return d;
  }

  async version() {
    return this.get('/sys/version');
  }

  // ============ 媒体库 ============

  /** 媒体库列表 */
  async libraryList() {
    return this.get('/mdb/list');
  }

  /**
   * 影片列表
   * @param {object} o {library_guid, start, page_size, type, sort, ...}
   */
  async itemList(o = {}) {
    return this.post('/item/list', {
      start: 0,
      page_size: 60,
      ...o,
    });
  }

  /** 影片详情 */
  async itemInfo(guid) {
    return this.get(`/item/${guid}`);
  }

  /** 季列表 */
  async seasonList(guid) {
    return this.get(`/season/list/${guid}`);
  }

  /** 集列表 */
  async episodeList(seasonGuid) {
    return this.get(`/episode/list/${seasonGuid}`);
  }

  /** 搜索 */
  async search(keyword, o = {}) {
    return this.post('/search/list', { keyword, start: 0, page_size: 60, ...o });
  }

  // ============ 播放 ============

  /** 播放元数据：media_guid / video_guid / audio_guid / subtitle_guid */
  async playInfo(itemGuid, mediaGuid) {
    const body = { item_guid: itemGuid };
    if (mediaGuid) body.media_guid = mediaGuid;
    return this.post('/play/info', body);
  }

  /**
   * 流信息：file_stream / video_stream / audio_streams / subtitle_streams / qualities
   * @param {string} mediaGuid
   * @param {object} o {ip, level}
   *
   * 注意：`ip` 不能为空，否则服务端返回 "Invalid Params"。
   * 不传时自动探测本机局域网 IP。
   */
  async streamPlayback(mediaGuid, o = {}) {
    let ip = o.ip;
    if (!ip) ip = await this._localIp();
    return this.post('/stream', {
      media_guid: mediaGuid,
      ip,
      header: { 'User-Agent': ['FnTV-Client'] },
      level: o.level === undefined ? 0 : o.level,
    });
  }

  /** 探测本机局域网 IP（UDP connect 不真正发包） */
  async _localIp() {
    const dgram = require('dgram');
    const host = this.baseUrl.replace(/^https?:\/\//, '').split(':')[0] || '127.0.0.1';
    return new Promise((resolve) => {
      const s = dgram.createSocket('udp4');
      let done = false;
      const finish = (ip) => { if (!done) { done = true; resolve(ip); } try { s.close(); } catch {} };
      s.on('error', () => finish('127.0.0.1'));
      try {
        s.connect(5666, host, () => finish(s.address().address));
      } catch { finish('127.0.0.1'); }
      setTimeout(() => finish('127.0.0.1'), 1500);
    });
  }

  /**
   * 原画直链 URL（不走服务端转码）
   * 支持 HTTP Range，只需 Authorization header
   */
  directUrl(mediaGuid) {
    return `${this.apiBase}/media/range/${mediaGuid}`;
  }

  /** 上报播放进度 */
  async reportProgress(itemGuid, mediaGuid, ts) {
    return this.post('/play/record', {
      item_guid: itemGuid,
      media_guid: mediaGuid,
      ts: Math.round(ts),
    });
  }

  /** 删除续播记录 */
  async removeProgress(itemGuid) {
    return this.request('DELETE', '/play/record', { body: { item_guid: itemGuid } });
  }

  /** 播放记录（继续观看） */
  async playList(o = {}) {
    return this.get('/play/list', { start: 0, page_size: 30, ...o });
  }

  // ============ 标记 ============

  async setWatched(itemGuid, watched = true) {
    return this.post('/item/watched', { guid: itemGuid, watched: watched ? 1 : 0 });
  }

  async setFavorite(itemGuid, favorite = true) {
    return this.request('PUT', '/item/favorite', { body: { guid: itemGuid } });
  }

  // ============ 图片 ============

  /**
   * 图片完整 URL
   * 前端使用 /v/api/v1/sys/img/{path}
   */
  imageUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//.test(path)) return path;
    return `${this.apiBase}/sys/img/${String(path).replace(/^\/+/, '')}`;
  }

  /** 字幕下载地址 */
  subtitleUrl(guid) {
    return `${this.apiBase}/subtitle/dl/${guid}`;
  }
}

module.exports = { FnClient, FnClientError, buildAuthx, md5 };

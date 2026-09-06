/**
 * 本地配置存储（服务器地址、凭据、播放偏好）
 * 数据落在 Electron userData 目录下的 config.json
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  servers: [],          // 已保存的服务器 [{ id, name, url, username }]
  lastServerId: null,
  credentials: {},      // { serverId: { username, password } }
  player: {
    hwdec: 'auto',      // 硬解模式：auto / d3d11va / nvdec / dxva2 / no
    volume: 100,
    rememberPosition: true,
    subtitleFontSize: 40,
    audioLanguage: 'chi',
    subtitleLanguage: 'chi',
  },
  window: { width: 1280, height: 800, maximized: false },
};

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'config.json');
    this.data = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      return { ...structuredClone(DEFAULTS), ...JSON.parse(raw) };
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('[store] save failed:', e.message);
      return false;
    }
  }

  get(key, fallback) {
    const v = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.data);
    return v === undefined ? fallback : v;
  }

  set(key, value) {
    const keys = key.split('.');
    const last = keys.pop();
    let obj = this.data;
    for (const k of keys) {
      if (typeof obj[k] !== 'object' || obj[k] === null) obj[k] = {};
      obj = obj[k];
    }
    obj[last] = value;
    this.save();
    return value;
  }

  all() {
    return this.data;
  }
}

let instance = null;
module.exports = {
  getStore: () => (instance ||= new Store()),
  DEFAULTS,
};

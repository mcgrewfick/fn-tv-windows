/**
 * 本地配置存储（服务器地址、凭据、播放偏好）
 * 数据落在 Electron userData 目录下的 config.json
 */
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

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

  // 密码加密存储：用系统级 safeStorage 加密，避免明文落盘
  _enc(pwd) {
    if (!pwd) return pwd;
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return 'enc:' + safeStorage.encryptString(pwd).toString('base64');
      }
    } catch (e) {
      console.error('[store] encrypt failed:', e.message);
    }
    return pwd; // 降级：系统不支持加密时保持原样
  }

  _dec(pwd) {
    if (!pwd || typeof pwd !== 'string' || !pwd.startsWith('enc:')) return pwd;
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(pwd.slice(4), 'base64'));
      }
    } catch (e) {
      console.error('[store] decrypt failed:', e.message);
    }
    return pwd; // 解密失败时原样返回
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
    // credentials 下的 password 读取时解密
    if (key.startsWith('credentials.') && key.endsWith('.password')) return this._dec(v);
    return v === undefined ? fallback : v;
  }

  set(key, value) {
    // credentials 下的 password 写入时加密
    if (key.startsWith('credentials.') && key.endsWith('.password')) {
      value = this._enc(value);
    }
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
    // 返回深拷贝，并对 credentials 里的 password 统一解密
    const data = structuredClone(this.data);
    for (const id of Object.keys(data.credentials || {})) {
      const c = data.credentials[id];
      if (c && c.password) c.password = this._dec(c.password);
    }
    return data;
  }
}

let instance = null;
module.exports = {
  getStore: () => (instance ||= new Store()),
  DEFAULTS,
};

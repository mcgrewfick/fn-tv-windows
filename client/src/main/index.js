/**
 * 飞牛影视 Windows 客户端 - 主进程入口
 */
const path = require('path');
const { app, BrowserWindow, ipcMain, protocol, net, session } = require('electron');

const { getStore } = require('./store');
const { FnClient, FnClientError } = require('./api');
const { getApi, setApi } = require('./api-instance');
const { PlayerWindow } = require('./player');

let mainWindow = null;
let playerWindow = null;
let store = null;
let api = null;

const IS_DEV = process.argv.includes('--dev');

/**
 * 视频由 mpv 独立进程渲染，Electron 自身不需要 GPU 合成。
 * 关闭硬件加速可避免部分环境（无显卡 / 虚拟机 / 远程桌面）下 GPU 进程崩溃导致应用退出。
 */
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-features', 'UseChromeOSDirectVideoDecoder');

function createMainWindow() {
  const cfg = store.get('window', { width: 1280, height: 800 });
  mainWindow = new BrowserWindow({
    width: cfg.width || 1280,
    height: cfg.height || 800,
    minWidth: 940,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#14171a',
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (cfg.maximized) mainWindow.maximize();
  });

  mainWindow.on('close', () => {
    if (!mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      store.set('window', {
        width: b.width, height: b.height,
        maximized: mainWindow.isMaximized(),
      });
    }
    if (playerWindow) playerWindow.close();
  });

  // 转发渲染进程日志，便于排查
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[renderer] did-fail-load', code, desc);
  });

  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

process.on('uncaughtException', (e) => console.error('[main] uncaught:', e));
process.on('unhandledRejection', (e) => console.error('[main] rejection:', e));

/** 注册 fntv:// 协议，用于加载需要鉴权的图片 */
function registerProtocols() {
  protocol.registerBufferProtocol('fntv', async (request, callback) => {
    try {
      const u = new URL(request.url);
      if (u.hostname !== 'image') {
        return callback({ statusCode: 404, data: Buffer.from('') });
      }
      const p = u.searchParams.get('p') || '';
      if (!p) return callback({ statusCode: 400, data: Buffer.from('') });

      const data = await fetchImage(p);
      if (!data) return callback({ statusCode: 404, data: Buffer.from('') });
      callback({ statusCode: 200, mimeType: data.mime, data: data.buf });
    } catch (e) {
      callback({ statusCode: 500, data: Buffer.from('') });
    }
  });
}

const imageCache = new Map();

async function fetchImage(imagePath) {
  if (!api || !api.token) return null;
  const key = imagePath;
  if (imageCache.has(key)) return imageCache.get(key);
  if (imageCache.size > 500) imageCache.clear();

  const url = api.imageUrl(imagePath);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: api.token,
        'X-Trim-Client': 'web',
        'X-Trim-Client-Version': '629',
        'client-type': 'Trim-NAS',
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') || 'image/webp';
    const item = { buf, mime };
    imageCache.set(key, item);
    return item;
  } catch {
    return null;
  }
}

// ============ IPC ============

function bindIpc() {
  // 窗口控制
  ipcMain.handle('win:minimize', () => mainWindow && mainWindow.minimize());
  ipcMain.handle('win:maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('win:close', () => mainWindow && mainWindow.close());
  ipcMain.handle('win:isMaximized', () => !!(mainWindow && mainWindow.isMaximized()));

  // 配置
  ipcMain.handle('config:get', (_e, key, fb) => store.get(key, fb));
  ipcMain.handle('config:set', (_e, key, val) => store.set(key, val));
  ipcMain.handle('config:all', () => store.all());

  // 认证
  ipcMain.handle('auth:login', async (_e, { url, username, password }) => {
    const c = new FnClient(url);
    await c.login(username, password);
    // 登录成功后再切换全局实例
    setApi(c);
    api = c;
    try { await c.serverInfo(); } catch { /* 可选 */ }
    return { ok: true, token: c.token };
  });

  ipcMain.handle('auth:userInfo', async () => {
    if (!api) throw new Error('未连接');
    return api.userInfo();
  });

  ipcMain.handle('auth:logout', async () => {
    if (api) { try { await api.post('/user/logout', {}); } catch { /* ignore */ } }
    api = null;
    setApi(new FnClient());
  });

  // 服务器
  ipcMain.handle('server:info', async () => (api ? api.serverInfo() : null));
  ipcMain.handle('server:version', async () => (api ? api.version() : null));

  // 媒体库
  ipcMain.handle('library:list', async () => (api ? api.libraryList() : []));
  ipcMain.handle('item:list', async (_e, o) => (api ? api.itemList(o || {}) : null));
  ipcMain.handle('item:info', async (_e, guid) => (api ? api.itemInfo(guid) : null));
  ipcMain.handle('season:list', async (_e, guid) => (api ? api.seasonList(guid) : []));
  ipcMain.handle('episode:list', async (_e, guid) => (api ? api.episodeList(guid) : []));
  ipcMain.handle('search', async (_e, kw) => (api ? api.search(kw) : null));
  ipcMain.handle('play:list', async (_e, o) => (api ? api.playList(o) : null));

  // 标记
  ipcMain.handle('item:setWatched', async (_e, guid, watched) =>
    (api ? api.setWatched(guid, watched) : null));
  ipcMain.handle('item:setFavorite', async (_e, guid) =>
    (api ? api.setFavorite(guid) : null));
  ipcMain.handle('play:removeProgress', async (_e, guid) =>
    (api ? api.removeProgress(guid) : null));

  // 播放
  ipcMain.handle('play:info', async (_e, itemGuid, mediaGuid) =>
    (api ? api.playInfo(itemGuid, mediaGuid) : null));
  ipcMain.handle('play:stream', async (_e, mediaGuid, level) =>
    (api ? api.streamPlayback(mediaGuid, { level }) : null));

  /**
   * 打开播放器：取原画直链，交给 mpv 本地硬解
   */
  ipcMain.handle('play:open', async (_e, o) => {
    if (!api) throw new Error('未连接服务器');
    const { itemGuid, mediaGuid, title, start, subFiles } = o || {};
    let mg = mediaGuid;
    if (!mg) {
      const info = await api.playInfo(itemGuid);
      mg = info && info.media_guid;
    }
    if (!mg) throw new Error('无法获取播放源');

    await playerWindow.open({
      url: api.directUrl(mg),
      token: api.token,
      title: title || '',
      itemGuid,
      mediaGuid: mg,
      start: start || 0,
      subFiles: subFiles || [],
    });
    return true;
  });

  ipcMain.handle('play:progress', async (_e, itemGuid, mediaGuid, ts) => {
    if (!api) return false;
    try {
      await api.reportProgress(itemGuid, mediaGuid, ts);
      return true;
    } catch { return false; }
  });

  ipcMain.handle('app:imageUrl', (_e, p) => (api ? api.imageUrl(p) : ''));
  ipcMain.handle('app:subtitleUrl', (_e, g) => (api ? api.subtitleUrl(g) : ''));
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:mpvAvailable', async () => {
    const { resolveMpvPath } = require('./mpv');
    return !!resolveMpvPath();
  });
}

// ============ 生命周期 ============

app.whenReady().then(() => {
  store = getStore();
  api = getApi();
  registerProtocols();
  bindIpc();
  playerWindow = new PlayerWindow(store);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

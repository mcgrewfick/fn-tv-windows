/**
 * 播放窗口管理（主进程）
 *
 * 双层窗口结构：
 *   videoWindow   - 黑底无边框窗口，mpv 通过 --wid 嵌入
 *   overlayWindow - 透明无边框置顶窗口，承载 HTML 控制条
 */
const path = require('path');
const { BrowserWindow, screen, ipcMain } = require('electron');
const { MpvPlayer } = require('./mpv');

const BLANK = 'data:text/html;charset=utf-8,' + encodeURIComponent(
  '<html><body style="margin:0;background:#000;overflow:hidden"></body></html>'
);

function hwndOf(win) {
  const h = win.getNativeWindowHandle();
  if (!h) return null;
  // Windows x64 -> 8 字节，HWND 取低 64 位
  return h.readBigUInt64LE ? h.readBigUInt64LE().toString() : h.readUInt32LE(0).toString();
}

class PlayerWindow {
  constructor(store) {
    this.store = store;
    this.videoWindow = null;
    this.overlayWindow = null;
    this.mpv = null;
    this.state = {
      itemGuid: null,
      mediaGuid: null,
      title: '',
      duration: 0,
      position: 0,
      lastReport: 0,
    };
    this.progressTimer = null;
    this._bindIpc();
  }

  get isOpen() {
    return !!(this.videoWindow && !this.videoWindow.isDestroyed());
  }

  _bindIpc() {
    ipcMain.handle('player:control', async (_e, action, payload) => {
      return this.control(action, payload);
    });
    ipcMain.handle('player:state', async () => this.getState());
    ipcMain.handle('player:close', async () => { this.close(); });
    ipcMain.handle('player:setIgnoreMouse', async (_e, ignore) => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.setIgnoreMouseEvents(!!ignore, { forward: true });
      }
    });
  }

  /**
   * 打开播放窗口
   * @param {object} o {url, token, title, itemGuid, mediaGuid, start, subFiles, audioLang, subLang}
   */
  async open(o) {
    await this.close();

    const playerCfg = this.store.get('player', {});
    const display = screen.getPrimaryDisplay();
    const { width: sw, height: sh } = display.workAreaSize;
    const w = Math.min(Math.round(sh * 1.78), sw - 80);
    const h = Math.round(w / 1.78);

    this.videoWindow = new BrowserWindow({
      width: w,
      height: h,
      minWidth: 640,
      minHeight: 360,
      frame: false,
      show: false,
      backgroundColor: '#000000',
      title: o.title || '飞牛影视',
      autoHideMenuBar: true,
      webPreferences: { offscreen: false, nodeIntegration: false },
    });
    this.videoWindow.loadURL(BLANK);

    this.overlayWindow = new BrowserWindow({
      width: w,
      height: h,
      frame: false,
      transparent: true,
      show: false,
      resizable: false,
      movable: false,
      hasShadow: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.overlayWindow.loadFile(
      path.join(__dirname, '..', 'renderer', 'player-overlay.html')
    );
    this.overlayWindow.setIgnoreMouseEvents(false);

    // 同步窗口位置
    const syncBounds = () => {
      if (!this.isOpen) return;
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        const b = this.videoWindow.getBounds();
        this.overlayWindow.setBounds(b);
        this.overlayWindow.setAlwaysOnTop(true);
      }
    };

    this.videoWindow.on('move', syncBounds);
    this.videoWindow.on('resize', syncBounds);
    this.videoWindow.on('restore', syncBounds);
    this.videoWindow.on('maximize', syncBounds);
    this.videoWindow.on('unmaximize', syncBounds);
    this.videoWindow.on('enter-full-screen', () => {
      syncBounds();
      this._emit('fullscreen', true);
    });
    this.videoWindow.on('leave-full-screen', () => {
      syncBounds();
      this._emit('fullscreen', false);
    });
    this.videoWindow.on('closed', () => this.close());

    this.videoWindow.show();
    this.videoWindow.focus();
    this.overlayWindow.show();
    syncBounds();

    // 启动 mpv
    const hwnd = hwndOf(this.videoWindow);
    this.mpv = new MpvPlayer();
    if (!this.mpv.available) {
      this._emit('error', '未找到 mpv.exe');
      return;
    }

    this.state = {
      itemGuid: o.itemGuid || null,
      mediaGuid: o.mediaGuid || null,
      title: o.title || '',
      duration: 0,
      position: 0,
      lastReport: 0,
      url: o.url,
    };

    this._wireMpv(o);

    this.mpv.start({
      wid: hwnd,
      url: o.url,
      token: o.token,
      title: o.title,
      start: o.start || 0,
      hwdec: playerCfg.hwdec || 'auto',
      volume: playerCfg.volume === undefined ? 100 : playerCfg.volume,
      subFontSize: playerCfg.subtitleFontSize || 40,
      audioLang: playerCfg.audioLanguage || 'chi,zh',
      subLang: playerCfg.subtitleLanguage || 'chi,zh',
      subFiles: o.subFiles || [],
      userAgent: 'FnTVClient/1.0',
    });

    // 进度上报定时器
    this.progressTimer = setInterval(() => this._reportProgress(), 10000);
  }

  _wireMpv(o) {
    const mpv = this.mpv;
    mpv.on('error', (e) => this._emit('error', String(e && e.message || e)));
    mpv.on('hwdec', (v) => this._emit('hwdec', v));

    mpv.on('property', (name, value) => {
      if (name === 'duration') this.state.duration = value || 0;
      if (name === 'time-pos') this.state.position = value || 0;
      this._emit('property', { name, value });
    });

    mpv.on('end-file', (e) => {
      this._reportProgress(true);
      if (e && e.reason === 'eof') this._emit('ended');
    });

    mpv.on('exit', () => {
      this._emit('closed');
      this._cleanup();
    });

    mpv.on('ready', () => this._emit('ready', { title: o.title }));
  }

  _emit(channel, payload) {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send('mpv:event', { channel, payload });
    }
  }

  async _reportProgress(force = false) {
    if (!this.state.itemGuid || !this.state.mediaGuid || !this.state.position) return;
    const now = Date.now();
    if (!force && now - this.state.lastReport < 9000) return;
    this.state.lastReport = now;
    try {
      const { getApi } = require('./api-instance');
      await getApi().reportProgress(this.state.itemGuid, this.state.mediaGuid, this.state.position);
    } catch { /* 静默失败，不打断播放 */ }
  }

  async control(action, payload) {
    const mpv = this.mpv;
    if (!mpv || !mpv.started) return null;
    switch (action) {
      case 'togglePause': return mpv.togglePause();
      case 'play': return mpv.play();
      case 'pause': return mpv.pause();
      case 'seek': return mpv.seek(payload);
      case 'seekRelative': return mpv.seekRelative(payload);
      case 'volume': return mpv.setVolume(payload);
      case 'mute': return mpv.toggleMute();
      case 'speed': return mpv.setSpeed(payload);
      case 'setAudio': return mpv.setAudio(payload);
      case 'setSubtitle': return mpv.setSubtitle(payload);
      case 'subDelay': return mpv.setSubDelay(payload);
      case 'fullscreen': {
        if (!this.videoWindow) return null;
        const target = payload === undefined ? !this.videoWindow.isFullScreen() : !!payload;
        this.videoWindow.setFullScreen(target);
        return target;
      }
      case 'getTracks': return mpv.getProperty('track-list');
      case 'getTime': return mpv.getProperty('time-pos');
      case 'quit':
        await this.close();
        return true;
      default:
        return null;
    }
  }

  async getState() {
    const tracks = this.mpv && this.mpv.started ? await this.mpv.getProperty('track-list') : [];
    return {
      ...this.state,
      tracks: tracks || [],
    };
  }

  _cleanup() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  async close() {
    this._reportProgress(true);
    this._cleanup();
    try {
      if (this.mpv) await this.mpv.quit();
    } catch { /* ignore */ }
    this.mpv = null;
    for (const w of [this.overlayWindow, this.videoWindow]) {
      try {
        if (w && !w.isDestroyed()) w.destroy();
      } catch { /* ignore */ }
    }
    this.videoWindow = null;
    this.overlayWindow = null;
  }
}

module.exports = { PlayerWindow, hwndOf };

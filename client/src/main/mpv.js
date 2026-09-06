/**
 * mpv 播放器控制器
 *
 * 方案：mpv 独立进程 + --wid 嵌入 Electron 窗口 + named pipe JSON IPC 控制
 * 优势：完整 GPU 硬解（d3d11va / nvdec / dxva2）、PGS/ASS 字幕、HDR，NAS 零转码压力
 */
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

/** 解析 mpv.exe 路径（打包后位于 resources/mpv） */
function resolveMpvPath() {
  const candidates = [
    process.env.FNTV_MPV_PATH,
    // 打包后
    process.resourcesPath && path.join(process.resourcesPath, 'mpv', 'mpv.exe'),
    path.join(process.resourcesPath || '', 'mpv', 'mpv.com'),
    // 开发环境：client/vendor/mpv-bin
    path.join(__dirname, '..', '..', '..', 'vendor', 'mpv-bin', 'mpv.exe'),
    path.join(__dirname, '..', '..', 'vendor', 'mpv-bin', 'mpv.exe'),
    path.join(__dirname, '..', '..', '..', 'vendor', 'mpv', 'mpv.exe'),
    // 系统 PATH
    'mpv.exe',
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (c === 'mpv.exe') return c; // 交给 spawn 用 PATH 解析
      if (fs.existsSync(c)) return c;
    } catch { /* ignore */ }
  }
  return null;
}

class MpvPlayer extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.mpvPath = opts.mpvPath || resolveMpvPath();
    this.proc = null;
    this.socket = null;
    this.pipeName = null;
    this.reqId = 0;
    this.pending = new Map();
    this.buffer = '';
    this.observers = [];
    this.started = false;
    this.quitting = false;
  }

  get available() {
    return !!this.mpvPath;
  }

  /**
   * 启动 mpv
   * @param {object} o
   *  wid         - 宿主窗口句柄（Windows HWND 数值）
   *  url         - 视频地址（原画直链）
   *  token       - Authorization
   *  title       - 媒体标题
   *  start       - 起始秒数
   *  hwdec       - 硬解模式
   *  subFiles    - 外挂字幕本地路径数组
   *  audioLang   - 首选音轨语言
   *  subLang     - 首选字幕语言
   */
  start(o = {}) {
    if (!this.available) throw new Error('未找到 mpv.exe，请将 mpv 放到 vendor/mpv 目录');

    this.pipeName = `\\\\.\\pipe\\fntv-mpv-${process.pid}-${Date.now()}`;

    const args = [
      `--input-ipc-server=${this.pipeName}`,
      '--no-config',
      '--idle=yes',
      '--keep-open=yes',
      '--osc=no',
      '--osd-level=1',
      '--border=no',
      '--title-bar=no',
      '--window-dragging=no',
      '--force-window=yes',
      '--cursor-autohide=no',
      `--hwdec=${o.hwdec || 'auto'}`,
      '--vo=gpu',
      '--gpu-context=d3d11',
      '--video-sync=display-resample',
      '--sub-auto=all',
      '--sub-font-size=' + (o.subFontSize || 40),
      '--sub-color=#FFFFFFFF',
      '--sub-border-size=2',
      '--sub-bold=yes',
      '--audio-pitch-correction=yes',
      '--volume=' + (o.volume === undefined ? 100 : o.volume),
      '--alang=' + (o.audioLang || 'chi,zh,eng'),
      '--slang=' + (o.subLang || 'chi,zh,eng'),
      '--force-media-title=' + (o.title || '飞牛影视'),
      '--cache=yes',
      '--demuxer-max-bytes=200M',
      '--demuxer-max-back-bytes=100M',
      '--msg-level=all=info',
    ];

    if (o.wid) args.push(`--wid=${o.wid}`);
    if (o.token) args.push(`--http-header-fields=Authorization:${o.token}`);
    if (o.userAgent) args.push(`--user-agent=${o.userAgent}`);
    if (o.start && o.start > 3) args.push(`--start=${Math.floor(o.start)}`);

    this.proc = spawn(this.mpvPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });

    this.proc.stdout.on('data', (d) => this._onStdout(d));
    this.proc.stderr.on('data', (d) => this._onStdout(d));
    this.proc.on('error', (e) => this.emit('error', e));
    this.proc.on('exit', (code) => {
      this.started = false;
      this.emit('exit', code);
    });

    this._connectIpc().then(() => {
      this.started = true;
      this._observe();
      this.emit('ready');
      if (o.url) {
        this.loadFile(o.url, o.subFiles || []);
      }
    }).catch((e) => this.emit('error', e));
  }

  _onStdout(d) {
    const s = d.toString();
    // 解析 mpv 日志中的硬解信息
    if (/Using hardware decoding/i.test(s)) {
      const m = s.match(/Using hardware decoding \(([^)]+)\)/i);
      if (m) this.emit('hwdec', m[1]);
    }
    this.emit('log', s);
  }

  _connectIpc() {
    return new Promise((resolve, reject) => {
      const tryConnect = (attempt = 0) => {
        const sock = net.createConnection(this.pipeName, () => {
          this.socket = sock;
          sock.setEncoding('utf8');
          sock.on('data', (chunk) => this._onData(chunk));
          sock.on('error', (e) => this.emit('error', e));
          sock.on('close', () => { this.socket = null; });
          resolve();
        });
        sock.once('error', () => {
          if (attempt < 60) setTimeout(() => tryConnect(attempt + 1), 100);
          else reject(new Error('无法连接 mpv IPC'));
        });
      };
      tryConnect();
    });
  }

  _onData(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }

      if (msg.event) {
        if (msg.event === 'property-change') {
          this.emit('property', msg.name, msg.data);
          this.emit(`property:${msg.name}`, msg.data);
        }
        this.emit(msg.event, msg);
      } else if (msg.request_id !== undefined) {
        const cb = this.pending.get(msg.request_id);
        if (cb) {
          this.pending.delete(msg.request_id);
          if (msg.error !== 'success') cb.reject(new Error(msg.error));
          else cb.resolve(msg.data);
        }
      }
    }
  }

  _observe() {
    const props = [
      'time-pos', 'duration', 'percent-pos', 'pause', 'mute', 'volume',
      'track-list', 'aid', 'vid', 'sid', 'speed', 'path', 'media-title',
      'video-params', 'hwdec-current', 'file-size', 'cache-buffering-state',
    ];
    for (let i = 0; i < props.length; i++) {
      this.command(['observe_property', i + 1, props[i]]).catch(() => {});
    }
  }

  /** 发送命令，返回 Promise */
  command(cmd, timeout = 8000) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('mpv 未连接'));
      const id = ++this.reqId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('mpv 命令超时: ' + JSON.stringify(cmd)));
      }, timeout);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.socket.write(JSON.stringify({ command: cmd, request_id: id }) + '\n');
    });
  }

  /** 通知型命令，不等待返回 */
  notify(cmd) {
    if (this.socket) this.socket.write(JSON.stringify({ command: cmd }) + '\n');
  }

  getProperty(name) {
    return this.command(['get_property', name]).catch(() => null);
  }

  setProperty(name, value) {
    return this.command(['set_property', name, value]).catch(() => null);
  }

  loadFile(url, subFiles = []) {
    this.notify(['loadfile', url, 'replace', 0]);
    // 外挂字幕延后加载，等文件打开
    if (subFiles && subFiles.length) {
      setTimeout(() => {
        for (const f of subFiles) {
          this.notify(['sub-add', f, 'auto']);
        }
      }, 1200);
    }
  }

  // ============ 播放控制 ============

  play() { return this.setProperty('pause', false); }
  pause() { return this.setProperty('pause', true); }
  togglePause() { return this.command(['cycle', 'pause']); }
  stop() { return this.command(['stop']); }

  seek(seconds, mode = 'absolute') {
    return this.command(['seek', seconds, mode]);
  }
  seekRelative(offset) { return this.seek(offset, 'relative'); }

  setVolume(v) { return this.setProperty('volume', Math.max(0, Math.min(130, v))); }
  toggleMute() { return this.command(['cycle', 'mute']); }

  setSpeed(s) { return this.setProperty('speed', s); }

  /** 切换音轨（mpv 的 aid，1 起） */
  setAudio(id) { return this.setProperty('aid', id); }

  /** 切换字幕（sid，'no' 表示关闭） */
  setSubtitle(id) { return this.setProperty('sid', id); }

  /** 字幕延迟（秒） */
  setSubDelay(d) { return this.setProperty('sub-delay', d); }

  /** 全屏 */
  setFullscreen(on) { return this.setProperty('fullscreen', !!on); }

  async quit() {
    this.quitting = true;
    try {
      if (this.socket) {
        this.socket.write(JSON.stringify({ command: ['quit'] }) + '\n');
      }
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 300));
    try {
      if (this.proc && !this.proc.killed) this.proc.kill();
    } catch { /* ignore */ }
    this.proc = null;
    this.socket = null;
    this.started = false;
  }
}

module.exports = { MpvPlayer, resolveMpvPath };

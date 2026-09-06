const { contextBridge, ipcRenderer } = require('electron');

/** 图片走 fntv:// 协议，由主进程代理并附加鉴权头 */
function img(path) {
  if (!path) return '';
  return `fntv://image?p=${encodeURIComponent(path)}`;
}

const api = {
  // 窗口
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    maximize: () => ipcRenderer.invoke('win:maximize'),
    close: () => ipcRenderer.invoke('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  },

  // 配置
  config: {
    get: (k, fb) => ipcRenderer.invoke('config:get', k, fb),
    set: (k, v) => ipcRenderer.invoke('config:set', k, v),
    all: () => ipcRenderer.invoke('config:all'),
  },

  // 认证
  auth: {
    login: (o) => ipcRenderer.invoke('auth:login', o),
    userInfo: () => ipcRenderer.invoke('auth:userInfo'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },

  server: {
    info: () => ipcRenderer.invoke('server:info'),
    version: () => ipcRenderer.invoke('server:version'),
  },

  library: { list: () => ipcRenderer.invoke('library:list') },

  item: {
    list: (o) => ipcRenderer.invoke('item:list', o),
    info: (guid) => ipcRenderer.invoke('item:info', guid),
    setWatched: (guid, w) => ipcRenderer.invoke('item:setWatched', guid, w),
    setFavorite: (guid) => ipcRenderer.invoke('item:setFavorite', guid),
  },

  season: { list: (guid) => ipcRenderer.invoke('season:list', guid) },
  episode: { list: (guid) => ipcRenderer.invoke('episode:list', guid) },
  search: (kw) => ipcRenderer.invoke('search', kw),

  play: {
    info: (itemGuid, mediaGuid) => ipcRenderer.invoke('play:info', itemGuid, mediaGuid),
    stream: (mediaGuid, level) => ipcRenderer.invoke('play:stream', mediaGuid, level),
    open: (o) => ipcRenderer.invoke('play:open', o),
    list: (o) => ipcRenderer.invoke('play:list', o),
    progress: (i, m, ts) => ipcRenderer.invoke('play:progress', i, m, ts),
    removeProgress: (guid) => ipcRenderer.invoke('play:removeProgress', guid),
    control: (action, payload) => ipcRenderer.invoke('player:control', action, payload),
    state: () => ipcRenderer.invoke('player:state'),
    close: () => ipcRenderer.invoke('player:close'),
    setIgnoreMouse: (v) => ipcRenderer.invoke('player:setIgnoreMouse', v),
  },

  app: {
    version: () => ipcRenderer.invoke('app:version'),
    mpvAvailable: () => ipcRenderer.invoke('app:mpvAvailable'),
    subtitleUrl: (g) => ipcRenderer.invoke('app:subtitleUrl', g),
  },

  img,

  /** 监听 mpv 事件（播放器悬浮层用） */
  onMpvEvent: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('mpv:event', handler);
    return () => ipcRenderer.removeListener('mpv:event', handler);
  },
};

contextBridge.exposeInMainWorld('fntv', api);

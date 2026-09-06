# FnTV Client — 飞牛影视本地客户端

一个基于 **Electron + mpv** 的飞牛影视（飞牛 FnOS 影视中心）Windows 本地客户端。直连飞牛影视服务器，用本机显卡/CPU 硬解播放，解决 NAS 配置不足时网页端 4K 硬解卡顿的问题。UI 对齐飞牛影视网页端。

## 为什么需要它

飞牛影视的 Windows 端只能通过网页观看。网页端在播放 4K 时依赖 NAS 服务端转码（HLS M3U8），当 NAS 的 CPU/GPU 配置不足时，播放会明显卡顿。

本客户端直接请求**原画直链**（HTTP Range 随机读取），把解码工作交给本机 GPU/CPU（D3D11VA / NVDEC / DXVA2 / QuickSync），NAS 零转码压力。

## 功能特性

- ✅ 原画直链播放，支持进度拖动（HTTP Range + MKV）
- ✅ 本机 GPU 硬解（mpv `hwdec=d3d11va/nvdec/dxva2`）
- ✅ 内嵌字幕（PGS/ASS）自动识别，外挂字幕下载
- ✅ 登录、媒体库、影片列表、详情、剧集、搜索、继续观看、播放进度上报
- ✅ UI 复刻网页端（Semi Design 暗色主题 + 海报墙 + 左右滑动箭头）

## 环境变量（签名常量）

飞牛影视 API 使用了 `authx` 签名算法，需要两个常量（逆向自公开前端 JS）。为避免硬编码到仓库，请通过环境变量注入：

```bash
# Windows PowerShell
$env:FNTOS_SECRET = "你的 secret"
$env:FNTOS_API_KEY = "你的 api_key"
```

- `FNTOS_SECRET` — authx 签名的 secret
- `FNTOS_API_KEY` — authx 签名的 api_key

> 提示：这两个值可通过抓取/查看飞牛影视网页前端的 JS 资源获得。出于尊重版权与安全的考虑，本仓库不内置。

## 快速开始

```bash
# 1. 安装依赖
cd client
npm install

# 2. 下载 mpv 二进制（放入 client/vendor/mpv-bin/）
#    mpv.exe / mpv.com / d3dcompiler_43.dll / fonts.conf

# 3. 注入环境变量后启动
npm start
```

## 打包

```bash
npm run dist   # 生成 portable 单文件 exe（dist/ 目录）
```

## 目录结构

```
client/
  src/main/         # 主进程（API 客户端、mpv 管理、播放窗口、IPC）
  src/renderer/     # 渲染进程（视图、CSS 主题）
docs/               # API 逆向手册
probe/              # 逆向参考脚本（已 gitignore）
```

## 免责声明

本项目仅用于个人学习与技术研究。使用前请确认你拥有所访问飞牛影视服务器及相关媒体内容的合法权限。请遵守飞牛系统的服务条款与当地法律法规，不得用于任何侵犯第三方权益的用途。

## License

[MIT](./LICENSE)

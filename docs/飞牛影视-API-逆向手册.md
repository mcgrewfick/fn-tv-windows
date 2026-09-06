# 飞牛影视 API 逆向手册

> 逆向目标：飞牛影视 Web 前端（`http://<NAS-IP>:5666/v/`）
> 服务端版本：影视中心 `0.9.7` / mediasrv `0.8.30`
> 逆向时间：2026-09-06（全部接口已实测通过）

---

## 一、基础信息

| 项 | 值 |
|---|---|
| API 前缀 | `/v/api/v1` |
| 其他前缀 | `/v/api/v2`、`/v/api/intl/v1`、`/v/api/intl/v2` |
| 鉴权 Header | `Authorization: <token>` |
| 客户端标识 | `X-Trim-Client: web`、`X-Trim-Client-Version: 629`、`client-type: Trim-NAS` |
| 签名 Header | `authx`（见第三节） |

响应统一格式：`{ "msg": "", "code": 0, "data": ... }`，`code === 0` 为成功。

---

## 二、签名算法（authx）

逆向自前端 `gu()` 函数。签名串拼接后用 **MD5（hex 小写）**：

```
secret   = "<从环境变量 FNTOS_SECRET 读取>"
api_key  = "<从环境变量 FNTOS_API_KEY 读取>"

GET 请求：
  a = query 参数按 key 升序排序后 urlencode（'+' 替换为 '%20'）
  h = md5(urldecode(a))
POST 请求：
  a = JSON.stringify(body)   // 无空格紧凑格式
  h = md5(a)

nonce     = 6 位随机数（100000 ~ 999999）
timestamp = 毫秒时间戳（13 位）
raw       = [secret, pathname, nonce, timestamp, h, api_key].join("_")
sign      = md5(raw)

Header: authx = "nonce={nonce}&timestamp={timestamp}&sign={sign}"
```

**关键点：**
- `pathname` 是**完整路径**，含 `/v/api/v1` 前缀
- GET 的 query 需按 key 排序；POST 用 body 原样 JSON
- 实测：登录接口即使不带 `authx` 也能成功，但其他接口建议全带

参考实现见 `probe/fnclient.py`。

---

## 三、核心接口清单

### 认证
| 方法 | 路径 | Body | 说明 |
|---|---|---|---|
| POST | `/login` | `{username, password}` | 登录，返回 `data.token` |
| GET | `/user/info` | - | 当前用户信息 |

### 媒体库
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/mdb/list` | 媒体库列表，返回 `guid / name / category(Movie\|TV) / dir_list` |
| POST | `/item/list` | 影片列表，body `{library_guid, start, page_size}` → `data.list / data.total` |
| GET | `/item/:guid` | 影片详情（海报、简介、演职员、评分） |
| GET | `/season/list/:guid` | 剧集季列表 |
| GET | `/episode/list/:guid` | 单季集数列表 |
| POST | `/search/list` | 搜索 |

### 播放（核心）
| 方法 | 路径 | Body | 说明 |
|---|---|---|---|
| POST | `/play/info` | `{item_guid, media_guid?}` | 播放元数据，返回 `media_guid / video_guid / audio_guid / subtitle_guid / item` |
| POST | `/stream` | `{media_guid, ip, header:{User-Agent:[]}, level}` | **流信息**：`file_stream`、`video_stream`、`audio_streams`、`subtitle_streams`、`qualities`。**⚠️ `ip` 不能为空，否则返回 `Invalid Params`** |
| GET | `/media/range/:media_guid` | - | **原画直链**（见第四节） |
| POST | `/play/record` | `{media_guid, item_guid, ts}` | 上报播放进度（秒） |
| DELETE | `/play/record` | `{item_guid}` | 清除续播记录 |
| GET | `/play/list` | - | 播放记录 / 继续观看 |
| POST | `/play/quality` | - | 画质列表 |
| GET | `/subtitle/dl/:guid` | - | 下载字幕（guid 为字幕流 guid） |

### 其他
- `GET /server/info` — 服务器配置（`direct_link_enable`、`gpu_acc` 等）
- `GET /sys/version` — 版本
- `GET /sys/img/...` — 图片资源
- `POST /item/watched`、`PUT /item/favorite` — 标记已看 / 收藏

---

## 四、原画直链（关键）

播放 URL 由前端 `j2()` 构造：

```
{BASE}/v/api/v1/media/range/{media_guid}[?playlink=xxx&direct_link_quality_index=n]
```

**实测结果：**
```
GET /v/api/v1/media/range/908477fb91a24f8480fac88d96f84af3
Authorization: <token>
Range: bytes=0-2047

→ HTTP 206
  Accept-Ranges: bytes
  Content-Range: bytes 0-2047/13284016032
  前 16 字节: 1a45dfa3... (EBML / MKV 魔数)
```

**结论：**
- 支持 HTTP Range 随机读取，可直接拖进度条
- 返回的是**原始文件字节流**，不经过服务端转码
- 只需 `Authorization` header，**不需要 authx 签名**
- 只要 NAS 网络带宽够，客户端可完全本地硬解，NAS 零转码压力

### 播放模式判定（前端逻辑）
```
cloud_storage_info 为空（本地文件）
  └─ direct_link_enable 开启 → RawFile 原画直链  ← 我们要的模式
  └─ 否则                    → HlsM3u8 服务端转码  ← 卡顿元凶
```

---

## 五、客户端开发要点

1. **播放内核**：推荐 `libmpv`（`media_kit` / `libmpv.NET` / `python-mpv`），支持 D3D11VA / NVDEC / QuickSync 硬解，PGS/ASS 字幕，HDR。
2. **直链优先**：始终请求 `media/range/{media_guid}`，避免 NAS 转码。
3. **进度同步**：播放中每 10s 上报一次 `POST /play/record`，退出时再上报一次。
4. **字幕**：内嵌字幕 mpv 自动识别；外挂字幕用 `GET /subtitle/dl/{guid}` 下载后喂给 mpv。
5. **图片**：海报路径需拼 `/v/api/v1/sys/img/{path}`。

### 踩坑记录（实测）
- **`/stream` 的 `ip` 参数必填**：传空字符串返回 `Invalid Params`。需用 UDP connect 探测本机局域网 IP（不真正发包）。参考 `client/src/main/api.js` 的 `_localIp()`。
- **`serverInfo` 方法名与数据属性冲突**：若在构造函数里初始化 `this.serverInfo = null`，会把 prototype 上的 `serverInfo()` 方法覆盖成 `null`，导致调用报 `serverInfo is not a function`。数据属性须改名（如 `_serverInfo`）。

---

## 六、已验证代码片段

`probe/fnclient.py` — 封装了 authx 签名 + 请求，可直接复用。
`probe/probe3.py` — 登录 → 媒体库 → 影片 → play/info → stream 全链路示例。
`client/src/main/api.js` — Node.js 版 API 客户端（含签名、`_localIp`、直链 URL 构造）。

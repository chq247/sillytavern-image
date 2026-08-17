# SillyTavern 自定义端点生图（纯前端扩展）

通过 CLIProxyAPI 的 `/v1/images/generations` 在 SillyTavern 中生成图片。不需要本地 GPU，
不修改 SillyTavern 源码，也不需要 SillyTavern 服务端插件。

该仓库可直接通过 SillyTavern 的 **Extensions → Install Extension** 使用 Git URL 安装。

- 当前扩展版本：`1.4.0`
- 最低 SillyTavern 版本：`1.18.0`
- 安装地址：`https://github.com/chq247/sillytavern-image.git`

## 功能

- `gpt-image-2` / `gpt-image-1.5`
- grok 生图模型：`grok-imagine-image` / `grok-imagine-image-pro`
- PNG、JPEG、WebP（gpt-image 系列）
- 13 个尺寸选项，覆盖 1:1、2:3、3:2、16:9、9:16（实际支持取决于自定义端点）；grok 模型会将所选尺寸自动换算为最接近的宽高比，并按面积选择 1k/2k 分辨率，"图片质量"与"图片格式"对 grok 模型不生效
- 9 种提示词来源：直接提示词、LLM 扩写、当前场景、最后消息、原始最后消息、当前角色、角色面部、用户形象、背景环境
- 自动生图：勾选后每次角色回复完成，自动根据聊天记录生成当前人物的实时图片（详见"自动生图"小节）
- `/plus-image [mode=<提示词来源>] [额外要求]` 斜杠命令
- 生成结果自动保存到当前角色或群组图库并插入聊天
- 连接测试、取消、超时、Base64/图片格式/响应大小校验（取消仅在图像 HTTP 请求阶段可用）
- 配置页支持“自动 / 中文 / English”实时切换，选择会保存在用户设置中
- 默认只把自定义 API 密钥放在当前页面的内存中，刷新即清除
- 可选择将自定义 API 密钥明文保存在 SillyTavern 用户设置中

## 在 SillyTavern 中安装

1. 打开 **Extensions → Install Extension**。
2. 粘贴仓库 Git URL：`https://github.com/chq247/sillytavern-image.git`。
3. 安装并刷新 SillyTavern 页面。
4. 打开 **Extensions → 自定义端点生图**。
5. 可先将 **Interface language / 界面语言** 切换为“中文”。
6. 填写 **自定义端点（基础 URL）**、**自定义 API 密钥**，认证选择 `x-api-key`。
7. 点击 **测试连接 / Test connection**，确认地址、认证和模型列表可访问。

> **测试连接只会请求 `/v1/models`。** 它不能证明图片权限、CORS POST 或
> `/v1/images/generations` 一定可用；安装后仍需实际生成一张安全测试图片完成验收。

Base URL 示例：

```text
http://127.0.0.1:8317/v1
https://proxy.example/v1
```

本扩展会自动补齐 `/v1/models` 和 `/v1/images/generations`，所以填写主机地址或
以 `/v1` 结尾的地址均可。

如果之前安装过需要 `plugins/cli-proxy-image` 的服务端桥接版本，请禁用或删除旧的
同名前端扩展，以免重复注册 `/plus-image` 命令。本仓库不需要那个服务端组件。

## CLIProxyAPI 要求

- 建议 CLIProxyAPI `v7.2.131` 或更新版本。
- `/v1/models` 应列出 `gpt-image-2`、`gpt-image-1.5` 或 grok 生图模型（如 `grok-imagine-image`）。
- `/v1/images/generations` 必须支持 `response_format: b64_json`；grok 模型走 `aspect_ratio` + `resolution` 参数，不支持 `size`/`quality`/`output_format`。
- 必须允许浏览器 CORS 预检使用 `POST/GET/OPTIONS`、`Content-Type` 和 `x-api-key`。
- `disable-image-generation` 不能设为 `true`。

CLIProxyAPI `v7.2.131` 默认提供宽松 CORS。若服务公开在局域网或互联网，建议由
Nginx/Caddy 将 `Access-Control-Allow-Origin` 限制为你的 SillyTavern Origin。
若选择 Bearer 认证，反向代理还应显式允许 `Authorization, Content-Type` 请求头；
对 CLIProxyAPI 默认 CORS，优先使用 `x-api-key`。

## 使用

### 从设置页生成

1. 先打开一个角色聊天或群聊。
2. 打开 **Extensions → 自定义端点生图**。
3. 选择 **提示词来源**。
4. 按所选模式填写提示词或额外要求。
5. 点击 **生成图片 / Generate**。

图片成功生成后会保存到当前角色或群组图库，并作为新消息插入当前聊天。

### 提示词来源

扩展提供以下 9 种来源：

| 模式 | 输入要求 | 行为 |
| --- | --- | --- |
| `free` | 必填 | 将输入内容直接发送给图片端点，维持旧版本行为 |
| `extend` | 必填 | 使用 SillyTavern 当前文本模型扩写输入的简短提示词 |
| `scene` | 可选 | 根据聊天上下文整理当前场景或整个故事的视觉内容 |
| `last` | 可选 | 从最后一条可用消息提炼适合绘图的视觉内容 |
| `raw_last` | 忽略输入框 | 直接使用最后一条非系统消息的原始内容 |
| `character` | 可选 | 根据上下文描述当前角色的全身形象 |
| `face` | 可选 | 根据上下文聚焦当前角色的面部与肖像细节 |
| `user` | 可选 | 根据上下文描述用户形象 |
| `background` | 可选 | 根据上下文描述背景或环境，不包含角色 |

`extend`、`scene`、`last`、`character`、`face`、`user` 和 `background` 会调用 SillyTavern 当前配置的文本模型来整理生图提示词，因此会消费该文本模型对应的额度。其中 `extend` 必须提供待扩写的提示词，其他六种模式可把输入框内容作为额外要求。`raw_last` 直接读取最后一条可用消息，不调用文本模型，也不追加输入框内容。`free` 同样不调用文本模型，并保持原有的直接生图行为。

### 斜杠命令

不填写 `mode` 时，会使用设置页当前保存的提示词来源。若要确保直接生图，请显式指定
`mode=free`。命名参数必须写在提示词或额外要求之前。

示例：

```text
/plus-image mode=free 一位银发女法师站在雨夜霓虹街道，电影感光影
/plus-image mode=extend 银发女法师
/plus-image mode=scene
/plus-image mode=last 写实摄影风格
/plus-image mode=character 电影感光影
/plus-image mode=face 柔和棚拍光线
/plus-image mode=user 全身构图
/plus-image mode=background 16:9，雨夜霓虹风格
/plus-image mode=raw_last
```

上下文整理阶段没有可用的中止接口，因此取消按钮只会在向图像端点发送 HTTP 请求后启用。

## 自动生图

在设置页勾选 **每次角色回复后自动生成图片** 即可开启。开启后，每当角色消息生成完成，
扩展会自动根据聊天记录提炼生图提示词并生成图片，插入当前聊天，实现"当前人物的实时图片"。

可配置项：

- **自动生图提示词来源**：默认 `当前角色`（根据聊天记录描述当前角色的全身形象）；也可选
  `当前角色面部`、`当前场景`、`最后消息`、`用户形象`、`背景环境`。群聊中"当前角色"不够
  精确时，建议改用 `最后消息` 或 `当前场景`。
- **自动生图冷却时间**：两次自动生图之间的最小间隔，默认 60 秒，可选 15 秒至 10 分钟或关闭。
  群聊中每个成员发言都会触发一次事件，冷却时间可以防止额度被快速耗尽。
- **首条消息也自动生图**：默认关闭。开启后打开聊天时的第一条消息也会触发生图。

行为细节：

- 每条角色回复触发一次时会调用当前文本模型（提炼提示词）和一次图片端点请求，请留意两侧额度消耗。
- 自动生图在角色回复完成约 1 秒后才开始，避免与主文本生成抢锁；期间切换聊天会静默放弃。
- 生成失败（含上游审核拦截）只弹一次警告并跳过，不会阻塞聊天，也不会自动重试。
- 正在手动生成、或自动生成进行中时，新到达的角色回复不会触发生成。
- 本扩展自己插入的图片消息不会再次触发生成（无递归）。

## 故障排查

### 在哪里看日志

- 浏览器按 `F12`，在 **Console** 查看扩展错误。
- 在 **Network** 中查看 `models`、`images/generations` 和 `api/images/upload` 请求。
- 点击某个请求后，可在 **Payload** 查看最终发送的提示词，在 **Response** 查看上游错误。
- SillyTavern 启动终端可查看图片保存和聊天写入错误。
- CLIProxyAPI 终端或服务日志可查看上游认证、额度与图片接口错误。
- 使用 Nginx 时，通常还应检查 `/var/log/nginx/error.log`。

### `400 moderation_blocked`

如果 `/v1/images/generations` 返回类似以下字段：

```json
{
  "error": {
    "code": "moderation_blocked",
    "moderation_details": {
      "moderation_stage": "output",
      "categories": ["sexual"]
    }
  }
}
```

说明请求已经到达图片服务，但被上游安全系统拦截，并非插件、密钥、CORS 或 Nginx
上传故障。`moderation_stage: output` 表示最终候选图片被拦截，不一定表示输入提示词本身
已经被拒绝。

排查步骤：

1. 改用 `free` 模式测试完全安全的无人物提示词，例如：

   ```text
   宁静的雪山湖泊，日出，风景摄影，没有人物
   ```

2. 在浏览器 **Network → images/generations → Payload** 检查最终 `prompt`。
3. 使用 `scene`、`last`、`character` 或 `face` 时，聊天上下文中的敏感描写可能被带入。
4. 对正常的成年、非情色题材，可明确追加 `SFW、完整日常服装、无裸露、无性暗示`。
5. 如果安全风景提示词仍反复被拦截，保留响应中的 Request ID 并联系上游支持。

插件不能关闭或绕过上游安全审核。不要高频重复失败请求，失败也可能影响可用额度。

### `/api/images/upload` 返回 `413 Request Entity Too Large`

如果 `/v1/images/generations` 已经返回 `200`，随后 SillyTavern 的
`/api/images/upload` 返回 Nginx `413`，说明图片已经生成，但反向代理允许的请求体太小。
在 SillyTavern 对应的 Nginx `server` 块中提高限制，例如：

```nginx
server {
    client_max_body_size 64m;
}
```

然后检查并重新加载 Nginx：

```sh
sudo nginx -t
sudo systemctl reload nginx
```

如果上层 `http`、反向代理面板、CDN 或其他网关还有更小的限制，也必须同时调整。

### 浏览器请求失败、CORS 或 Mixed Content

- HTTPS SillyTavern 页面不能直接请求公网 HTTP 图片端点，应给端点配置 HTTPS。
- 端点的 CORS 预检必须允许 SillyTavern 的 Origin。
- 至少允许 `GET, POST, OPTIONS`、`Content-Type`，以及所选认证头：
  `x-api-key` 或 `Authorization`。
- 请求 `/v1/models` 成功但 POST 失败时，应单独检查
  `/v1/images/generations` 的 CORS、图片权限和请求参数兼容性。

### 连接成功但无法生成

依次确认：

1. `/v1/models` 返回的精确模型 ID 与扩展中选择的模型一致。
2. `/v1/images/generations` 支持非流式 Base64 响应 `data[0].b64_json`。
3. CLIProxyAPI 未设置 `disable-image-generation: true`。
4. 当前账户仍有图片权益，且没有触发限额、内容审核或上游接口变更。
5. 自定义尺寸是否被端点支持；不确定时先测试 `1024x1024`。

## 安全边界

纯前端方案无法隐藏 key：同源的其他 SillyTavern 扩展、浏览器 DevTools 或 XSS
都可能读取它。只使用可随时轮换、权限有限的 **自定义 API 密钥**；绝不要填写
ChatGPT OAuth token、Cookie、账号密码或 Plus 会话凭据。

- 默认不持久化 key，只保存在当前页面内存中，刷新页面即清除。
- 勾选 “Remember key” 后，key 会以明文进入 SillyTavern 用户设置。
- 请求使用 `credentials: omit`，不会把 SillyTavern Cookie 发给 CLIProxy。
- 请求拒绝 HTTP 重定向和 URL 型图片响应。
- HTTPS SillyTavern 不能直连公网 HTTP CLIProxy；请给 CLIProxy 配置 HTTPS。
- 本方案只有当前标签页的并发保护，没有服务端用户白名单或全局额度限制，建议单用户使用。

ChatGPT Plus 不会变成 OpenAI 官方 API 余额。本扩展依赖 CLIProxyAPI 对
ChatGPT/Codex OAuth 能力的非官方桥接，额度、稳定性和兼容性由上游控制。

## 开发测试

```sh
npm test
node --check index.js
```

许可证：AGPL-3.0-only。

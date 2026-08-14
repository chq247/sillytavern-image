# SillyTavern CLIProxy Plus Image（纯前端扩展）

通过 CLIProxyAPI 的 `/v1/images/generations` 在 SillyTavern 中生成图片。不需要本地 GPU，
不修改 SillyTavern 源码，也不需要 SillyTavern 服务端插件。

该仓库可直接通过 SillyTavern 的 **Extensions → Install Extension** 使用一个 Git URL 安装。

## 功能

- `gpt-image-2` / `gpt-image-1.5`
- PNG、JPEG、WebP
- 13 个尺寸选项，覆盖 1:1、2:3、3:2、16:9、9:16（实际支持取决于自定义端点）
- `/plus-image <prompt>` 斜杠命令
- 生成结果自动保存到当前角色或群组图库并插入聊天
- 连接测试、取消、超时、Base64/图片格式/响应大小校验
- 配置页支持“自动 / 中文 / English”实时切换，选择会保存在用户设置中
- 默认只把 CLIProxy key 放在当前页面的内存中，刷新即清除
- 可选择将 key 明文保存在 SillyTavern 用户设置中

## 作为独立 Git 仓库发布

必须把本目录中的文件直接放在 Git 仓库根目录；不要再套
`public/scripts/extensions/third-party/...` 子目录：

```text
manifest.json
index.js
api.js
settings.html
style.css
README.md
LICENSE
package.json
api.test.js
```

示例：

```sh
cd sillytavern-cli-proxy-image
git init
git add .
git commit -m "Initial SillyTavern CLIProxy image extension"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

## 在 SillyTavern 中安装

1. 打开 **Extensions → Install Extension**。
2. 粘贴仓库 Git URL，例如 `https://github.com/<user>/<repo>.git`。
3. 安装并刷新 SillyTavern 页面。
4. 打开 **Extensions → CLIProxy Plus Image (Direct)**。
5. 可先将 **Interface language / 界面语言** 切换为“中文”。
6. 填写 CLIProxy Base URL、客户端 key，认证选择 `x-api-key`。
7. 点击 **测试连接 / Test connection**；成功后即可生成。

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
- `/v1/models` 应列出 `gpt-image-2` 或 `gpt-image-1.5`。
- `/v1/images/generations` 必须支持 `response_format: b64_json`。
- 必须允许浏览器 CORS 预检使用 `POST/GET/OPTIONS`、`Content-Type` 和 `x-api-key`。
- `disable-image-generation` 不能设为 `true`。

CLIProxyAPI `v7.2.131` 默认提供宽松 CORS。若服务公开在局域网或互联网，建议由
Nginx/Caddy 将 `Access-Control-Allow-Origin` 限制为你的 SillyTavern Origin。
若选择 Bearer 认证，反向代理还应显式允许 `Authorization, Content-Type` 请求头；
对 CLIProxyAPI 默认 CORS，优先使用 `x-api-key`。

## 使用

在设置页输入提示词并点击 **Generate**，或在聊天中执行：

```text
/plus-image 一位银发女法师站在雨夜霓虹街道，电影感光影
```

## 安全边界

纯前端方案无法隐藏 key：同源的其他 SillyTavern 扩展、浏览器 DevTools 或 XSS
都可能读取它。只使用可随时轮换、权限有限的 **CLIProxy 客户端 key**；绝不要填写
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

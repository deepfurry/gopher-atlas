# 生产部署与发布操作手册

本手册记录 2026-09-22 用户在实际服务器执行并提供终端输出、后台及 Public
截图验证的流程。仅有 Development / Production；不需要额外环境或代理服务。

## 当前已验证的部署

```text
/srv/gopheratlas/
├── repo/                    # main，生产发布快照
├── bin/gopheratlas-cms       # 内嵌 Admin 的 Go 二进制
├── config/cms.env           # 私有配置，不提交仓库
├── data/gopheratlas.db      # SQLite，schema 3
├── logs/
└── backups/                 # root-only，按时间保存
```

- systemd：`gopheratlas-cms.service`，监听 `127.0.0.1:46217`。
- Tailscale Serve 提供 Tailnet 内 HTTPS；不使用 Nginx 或 Funnel。
- Production 从 systemd 的 `EnvironmentFile` 读取 `config/cms.env`，不自动读取仓库 `.env`。
- `CMS_BASE_URL` 是私有 HTTPS origin；GitHub OAuth callback 是该 origin 加
  `/api/auth/github/callback`。切换 Public 域名不需要改变 CMS origin 或 OAuth callback。
- Cloudflare Worker 为 `gopheratlas-web`，Production 构建 `main`，关闭非生产分支构建。
- 私有 R2 content bucket 为 `gopheratlas-content`；素材通过 `assets.gopheratlas.com` 访问。
- CMS 使用 RW 凭据，Cloudflare Build 使用独立的 content bucket RO 凭据。

具体私有主机名、Tailnet IP、凭据及 Deploy Hook URL 不记录在本手册中。

## 日常更新

代码在 dev 验证并提交，正式发版使用普通 Git merge 到 main 后 push，不要求创建 PR。
main 推送会触发已配置的 Cloudflare 构建；CMS 仍需要在服务器执行更新。

用仓库所有者（例如 `ops`）执行，不要使用 `sudo make`：

```bash
cd /srv/gopheratlas/repo
git pull --ff-only origin main
make prod-update
```

脚本先安装锁定依赖并构建 Admin/embed CMS，再停服备份完整 data 和旧二进制，
原子安装新二进制、启动服务并检查 health/readiness。构建失败不会停止现有服务。
无需重复运行服务器原来的 `update.sh`，也无需手动复制二进制。
脚本不迁移数据库，不修改配置或 DNS；将来需要 schema 升级时须另行安排。

本次实际更新到 `a1f4638b30a35c81a83f959c8bd90cda76c7c3da`，脚本返回
`health and readiness passed`。重启 CMS 会恢复正常 publication worker，可能处理已有任务。

## 备份

```bash
cd /srv/gopheratlas/repo
make prod-backup
```

`prod-update` 已自带更新前备份；上面命令用于需要额外恢复点的时候。
它短暂停止唯一 CMS writer，复制 SQLite 与 WAL/SHM、旧二进制，并恢复原运行状态。
输出的备份目录包含 `SHA256SUMS`、`metadata.txt` 和成功后的 `COMPLETE`。
不会自动清理旧备份，也不会备份 `cms.env` 或 R2 objects。

本次更新备份和独立备份均成功，但都早于首次内容发布。它们不包含后来发布的建站记录。
下一次维护前应重新备份；数据、配置的受保护异机副本仍由运营者保管。
备份命令成功不等于完成恢复演练。不要直接用旧库覆盖当前库：旧 generation 可能与 R2
已有 immutable key 冲突。恢复原则见 [backup-restore.md](backup-restore.md)。

## 中国服务器的 GitHub OAuth 与 Mihomo

实测服务器直连 GitHub Token endpoint 超时；经现有 Mihomo 代理可达。
`proxy_on` 仅修改交互终端环境，不会改变 systemd 已启动的 CMS。
现有 `mihomo.service` 的 mixed-port 为 7890，绑定 `127.0.0.1`，`allow-lan: false`。
不需要新增服务或开放代理端口。

在现有文件中编辑同名变量，避免重复赋值，不要把整个文件输出到终端或报告：

```bash
sudoedit /srv/gopheratlas/config/cms.env
```

```dotenv
HTTPS_PROXY=http://127.0.0.1:7890
NO_PROXY=localhost,127.0.0.1,::1,.ts.net,.r2.cloudflarestorage.com,.cloudflare.com,gopheratlas.com,.gopheratlas.com
```

此处 HTTP proxy 为 HTTPS 请求建立隧道。GitHub 走代理，列出的本地、Tailnet、R2、
Cloudflare 和站点域名直连。例外按实际目标 hostname 匹配；自定义 endpoint 需单独核对。
这不是只作用于 OAuth 的配置，CMS 其他使用环境代理的 HTTP 请求也可能受影响。

```bash
sudo systemctl restart gopheratlas-cms.service
systemctl is-active gopheratlas-cms.service
curl -fsS http://127.0.0.1:46217/readyz
```

只修改 EnvironmentFile 内容不需要 `daemon-reload`。从后台首页重新点击 GitHub 登录，
不要刷新旧 callback；OAuth state/code 不能重用，也不能贴出完整 callback URL。
此次配置后，用户已成功登录，后台显示正常管理员账号。

无凭据网络排查（不使用 `-v`、不输出响应正文）：

```bash
curl -sS -o /dev/null --proxy http://127.0.0.1:7890 --noproxy '' \
  --connect-timeout 5 --max-time 10 \
  -w 'github: HTTP %{http_code}, total %{time_total}s\n' \
  https://github.com/login/oauth/access_token
curl -sS -o /dev/null --proxy http://127.0.0.1:7890 --noproxy '' \
  --connect-timeout 5 --max-time 10 \
  -w 'api: HTTP %{http_code}, total %{time_total}s\n' https://api.github.com/user
```

本次分别返回 404 和 401，表示无凭据请求已收到响应，不代表 OAuth 凭据已验证。
`oauth_exchange_failed` 同时涵盖网络、Token 交换和身份解析失败；不能单凭错误码断定 Secret 错误。

## 首次发布与日常验收

1. 完善个人资料，创建学习随笔，填写标题、摘要、路径标识、分组与 Markdown，等待保存完成。
2. 管理员在更多操作中选择直接发布并确认；日常协作也可走提交审核流程。
3. 查看「发布状态」及任务详细信息。真实链路为
   `Revision → generation/job → R2 snapshot → latest.json → Hook → Workers Build`。
4. Cloudflare 查看 main 的最新构建与部署结果。Hook 接受请求不等于部署完成。
5. CMS 页面显示「已同步」、CMS 与公开站点 generation 相同，表示已读到对应 public marker。
6. 在 Worker 地址检查列表、详情、图片、刷新后的访问，以及
   `/.well-known/gopheratlas-build.json`；核对 generation 和任务 SHA-256。

本次首次构建在 generation 0 时以 `content_snapshot_load_failed` 失败。
随后用户发布「GopherAtlas 建站记录」，生成 `snapshots/generation-1.json`；
后台截图确认 CMS/Public 均为 1、状态「已同步」，无任务错误；Worker 首页可访问。
任务保留「已请求构建」是正常的，最终同步状态由 marker 决定。
独立 marker hash 比对、随笔详情/搜索/RSS/sitemap 的人工验收尚无回报，不能记为已通过。

没有初始快照时不要使用 fixture、手写 latest.json 或放宽构建校验。
已有快照仍构建失败时，应检查错误阶段、content RO 配置及 snapshot schema/hash，
不要把所有 `content_snapshot_load_failed` 都归因为缺少 latest。

## 后续：从头开始，只切换正式域名

用户于 2026-09-22 明确取消生产旧内容迁移，见 [ADR 0015](../decisions/0015-fresh-start-domain-cutover.md)。
保留当前生产账号、建站记录和 generation；不清库，不导入旧仓库或本地模拟数据，
不新增 Production Importer，不要求逐个保留旧站内容 URL。

后续只需在单独执行的切换中核对现有域名归属/路由、保留回退配置、绑定新 Worker，
验证 HTTPS 和新站页面。缺失的旧文章可以返回真实 404，不批量重定向到首页。
Public canonical 已在 Astro 配置中固定为 `https://gopheratlas.com`；
CMS 的 `PUBLIC_SITE_URL` 当前用于 Worker marker 探测，正式域名可达后再调整并重启验证。
不要修改私有 CMS/Tailscale/OAuth origin，也不要改动 assets 域名或 bucket。
本次文档整理没有修改 DNS、Cloudflare 配置或执行恢复、导入。

# GopherAtlas

**Technical Journal × Knowledge Atlas** — 面向 Go 开发者的知识地图与多作者
Markdown 出版平台。

当前完成 **P0-5：Full Public Astro Site**。
私有 CMS 提供内容表格、Markdown 编辑/安全预览、串行 autosave、审核工作区、
Revision History、Tags/Authors/Users/Audit 和 Monitor。Publish 仅表示 **已在 CMS 发布**；
已实现 Assets/R2、原子 generation/outbox、Snapshot v1、Worker/Hook 和公开构建 marker。
Public 从 snapshot v1 构建完整阅读页面、静态 redirects、RSS/sitemap/SEO 与 Pagefind 搜索。
人工 Production CMS 已部署并验证登录和 Asset 上传。
真实 generation → snapshot → Hook → marker 尚未人工验收。
详见 [阶段范围](docs/implementation-status.md)。

## 架构

```text
当前私有 CMS：Go / Fiber v3 + 内嵌 React Admin → SQLite / sqlc / goose
发布链路：CMS → 私有 R2 快照 → Astro 静态构建 → Workers Static Assets
                    └── 不可变 R2 图片 ──────────────→ 公共读者
```

公共站不在请求时依赖 CMS；私有服务器离线不影响读者。源码留在 Git，内容
通过 CMS 编辑与发布；about/contribute 页面继续随仓库维护。

| 目录                                 | 当前职责                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `apps/web`                           | snapshot v1 静态阅读站、四类详情/目录、搜索、RSS/SEO/redirects              |
| `apps/admin`                         | 按 feature 拆分的 React/Vite 编辑工作台、Base UI、RHF、TanStack Table/Query |
| `packages/markdown`                  | CommonMark/GFM 安全规则与共享 remark 插件                                   |
| `packages/api-client`                | OpenAPI 生成类型、同源请求及 CSRF header                                    |
| `cmd/gopheratlas-cms`                | 配置、共享 logger、SQLite、OAuth 服务的构造与关闭                           |
| `internal/app`, `internal/http`      | Fiber 中间件顺序、API、错误与 cookie 边界                                   |
| `internal/auth`, `internal/policy`   | 身份事务、会话和集中权限判断                                                |
| `internal/content`, `internal/audit` | 内容工作流、路由、taxonomy 和同事务安全 Audit                               |
| `internal/database`, `db`            | SQLite 连接池、真实 goose migrations 和 sqlc queries                        |
| `internal/adminui`                   | 编译进 Go 二进制的 Admin 生产静态文件                                       |

## 分支模型

初期集中开发按用户授权直接在 clean、已同步的 `dev` 提交和 push。
环境仅 Development / Production；`main` 保存生产发布快照，不直接开发，也不由本阶段同步。
CI 检查 push 与 PR 的 `dev`、`main`；仓库默认分支和 Ruleset 由维护者管理。

## 本地开始

需要 Git、GNU Make、Node **24.15.0**、pnpm **12.3.4**、Go **1.26.8**。
版本由 `.node-version`、`.go-version`、根 `packageManager` 固定。
pnpm 的精确保存、严格 engine 检查、`minimumReleaseAge: 0` 与 esbuild/sharp
构建白名单在 `pnpm-workspace.yaml`；`.npmrc` 仅用于 registry/auth。
CI 使用 `pnpm/action-setup@v6.1.0` 读取根版本。

```sh
pnpm install --frozen-lockfile
go mod download
make check
```

本地初始化数据库必须显式选择路径。PowerShell 示例：

```powershell
New-Item -ItemType Directory -Force data
$env:DATABASE_PATH = './data/gopheratlas.db'
make db-status
make db-up
```

Bash 使用 `mkdir -p data` 和 `export DATABASE_PATH=./data/gopheratlas.db` 后运行相同
make 命令。迁移脚本不隐式加载 `.env`；CMS 启动和 `/readyz` 也不会执行迁移。
已有数据库需显式运行 `make db-up` 至 `00003_publication.sql`。00001/00002 保持不变，
readiness 要求 schema version 3、cover 列、assets/jobs 和 site_state singleton。

配置好根 `.env` 后，可在一个终端启动全部开发服务（Windows PowerShell、Linux/macOS 相同）：

```sh
make dev
```

该命令先编译开发 CMS、准备 Public 快照，再启动 CMS / Admin / Public。
任一服务退出或启动失败会停止其余服务，`Ctrl+C` 统一退出；Linux/macOS 先发送终止信号，
超时后强制清理进程组，Windows 按本次启动的 PID 清理完整子进程树。
Windows 的子进程输出通过管道转发到当前终端，避免 PowerShell/Windows Terminal
中分离进程继承控制台句柄后静默退出；`Ctrl+C` 仍由启动器统一处理。
数据库仍需提前显式迁移，不会自动建业务 Schema。也可以分三个终端单独启动：

```sh
make dev-cms     # CMS: 127.0.0.1:46217
make dev-admin   # 浏览器: http://127.0.0.1:5173
make dev-web     # Public: http://127.0.0.1:4321；自动读取根 .env
```

`make dev-cms` 保持通过 Node 的 `--env-file-if-exists=.env` 读取根 `.env`；
`make dev-web` 和 `make dev` 采用相同的进程变量优先规则，缺失文件无妨。
`make dev` 使用与 `go run` 相同的无内嵌 SPA 开发 CMS，Admin 由 Vite 提供。
直接运行 Go 二进制只读 process env。检查和测试不加载仓库的真实 `.env`，
所有测试数据库都位于临时目录。不要把真实配置、token、cookie 或 OAuth 参数写入
日志、fixture、提交或报告。

Admin Vite 将 `/api`、`/ops`、`/healthz`、`/readyz` 同源代理到 `CMS_LISTEN_ADDR`，
仅从根环境读取该非秘密代理地址。CMS 始终要求 loopback IP 和 1024–65535 端口。

## GitHub 登录与身份

本地将 `.env.example` 复制为未跟踪的 `.env`，按 OAuth App 配置填写
`GITHUB_OAUTH_CLIENT_ID`、`GITHUB_OAUTH_CLIENT_SECRET`、
`GITHUB_OAUTH_REDIRECT_URI`、`BOOTSTRAP_ADMIN_GITHUB_ID`。开发浏览器 origin 默认
`http://127.0.0.1:5173`，回调应为该 origin 下的 `/api/auth/github/callback`，并匹配
GitHub OAuth App 注册设置。`CMS_BASE_URL` 必须与浏览器 origin 一致。

生产设置 `APP_ENV=production`、`CMS_BASE_URL=https://<private-tailnet-host>.ts.net`，回调为
`https://<private-tailnet-host>.ts.net/api/auth/github/callback`。生产必须提供完整 OAuth 配置和
正整数 bootstrap ID，并通过 Tailscale HTTPS 访问。OAuth token 仅用于 `/user`
身份解析，之后丢弃，不入库。测试只连接本地 fake provider。

- GitHub numeric ID 是身份主键，login 可更新。作者 slug 为 `github-<numeric-id>`，
  当前不可改名；显示名称、Markdown 简介和网站可编辑。
- 首次未知用户为 `editor/pending`。无 active Admin 时，只有匹配 bootstrap ID 的
  非 disabled 用户可成为第一个 Admin；存在 Admin 后由用户管理界面审批和授权。
- Admin 管理用户及 Monitor；Reviewer 和 Editor 只能访问其服务器权限允许的界面。
  最后一个 active Admin 不能被停用或降级；停用事务同时撤销该用户的所有会话。
- OAuth state 一次性、短期、绑定发起浏览器；数据库只存 hash，原子消费防重放。
- Session 与 CSRF 使用独立随机值，SQLite 只存 SHA-256；Session 默认 168h 绝对
  有效期。生产 cookie 为 `__Host-gopheratlas_session`，Secure/HttpOnly/Lax/Path=/，
  无 Domain；CSRF cookie 同样 host-only/Secure，但可被 JS 读取。
- 客户端从 cookie 读取 CSRF 并发送 `X-CSRF-Token`，服务端同时验证 cookie、hash
  和精确 Origin。刷新/多标签不需要 LocalStorage。退出撤销持久 Session 后清 cookie。
  HTTP loopback 开发使用单独的 `gopheratlas_dev_*` cookie 名。

## 构建、健康检查与日志

```sh
make build-cms
# 输出 .cache/bin/gopheratlas-cms（Windows 为 .exe）
```

构建先生成 `apps/admin/dist` 并复制到忽略的 `internal/adminui/dist`，再用
`-tags=adminembed` 编译。生产只运行该 Go 二进制，不需要 Node。直接 `go test ./...`
或 `go run` 无需已有前端产物；此模式的 SPA 返回 503，开发 UI 由 Vite 提供。
生产 tag 没有构建产物会在编译时失败，不会静默打包占位页面。

使用内嵌 Admin 本地验证时，将 `CMS_BASE_URL` 和 OAuth 回调改为实际 CMS 浏览器
origin（例如 `http://127.0.0.1:46217`）。构建产物不包含 `.env` 或 OAuth Secret。

`/healthz` 只表示进程存活；`/readyz` 检查 SQLite 和 P0-4 migration/列集合，缺失或
不兼容返回 503。GitHub、R2、Hook 和公开 marker 是否在线均不影响 readiness。`/ops/monitor` 只有 active
Admin 能打开；一个 app-wide Monitor 包裹业务请求，Recover 在其后。

一个共享 Zap logger 同时写 JSON 到 stdout 和 Lumberjack JSONL 文件。默认
`./logs/cms.jsonl`，100 MB / 10 份 / 30 天 / 压缩；`LOG_*` 可配置。contrib Zap 只记
`latency/status/method/path/request_id`，不记 query、body、IP、UA、cookie、Authorization
或错误原文。health/readiness/Monitor 不写 access log。反向代理也必须避免记录
OAuth query。生产 CMS 已由 systemd 管理，通过 Tailscale Serve 暴露私有 HTTPS；详见运维文档。

## 验证与生成

```sh
make generate        # OpenAPI → TS，真实 migrations/queries → sqlc
make check           # 最终统一门禁
```

门禁包括边界检查、gofmt/vet/staticcheck、Go 身份/内容/并发/数据库/HTTP 测试、前端 lint/
类型/身份与编辑审核 UI 测试、OpenAPI 和生成漂移、goose/sqlc 隔离验证、Public 构建，以及
Admin 生产构建后的 embed 测试和最终 Go 二进制编译。Linux CI 另外执行
`go test -race -tags=adminembed ./...`。sqlc 输出与 TS schema 必须经生成，不手改。

## 设计与工程上下文

Public 采用技术刊物的阅读层级、自托管 Geist/JetBrains Mono、暖纸/石墨主题，
不使用 shadcn；Admin 为紧凑的 Base UI 工作台。见 [设计合同](contracts/design.md)、
[设计系统](docs/design-system.md)、[AGENTS.md](AGENTS.md)、[架构](.agents/architecture.md)
及 [ADR](docs/decisions/README.md)。

## 内容 API 与 Admin 工作流

`/api/admin/v1/content` 创建/读取内容；Draft PUT 是包含 `version` 的完整快照，
同事务更新字段、Tags 和 Topic 顺序。旧版本保存返回 `409 content_version_conflict`。
正文上限 512 KiB UTF-8，普通 JSON 请求上限 1 MiB，Review comment 上限 16 KiB；
服务端验证 Markdown 和强类型 payload，拒绝未知 subtype 字段。

Owner/Admin 可提交、撤回及将历史 Revision 恢复到 Draft。Reviewer 只审核 exact
pending Revision，不能审核自己 owned/byline 的内容；Admin 可以 bypass，也可
direct publish。发布后继续编辑只改变 Draft，已发布 Revision 指针保持独立。
Tag 写入、Topic 创建、featured 变更、unpublish/archive 仅 Admin 可操作。

Publish **表示 SQLite 选定 Revision 并原子排队 generation/job**，并不表示公共网站已重建。路由历史永久
保留，重命名将旧路径转为按 Content identity 解析的 redirect；unpublish/archive
不释放路径。Audit 与重要 mutation 同事务，覆盖身份变更，但不记录 Draft autosave、
正文、Review comment、payload 或凭据。各 list 使用最多 100 条的 keyset 分页。

接口与请求/响应见 [OpenAPI](contracts/openapi.yaml)，领域约束见
[Data contract](contracts/data.md) 和 [ADR 0006](docs/decisions/0006-content-revision-and-route-model.md)。
P0-3 增加 author summaries、immutable Review detail、列表筛选及 server action projection；
筛选不绕过 object policy，Reviewer 的历史详情也不返回他人的 Draft。
P0-4 publication 网络步骤独立于 SQLite 事务；旧站导入和生产切换更晚。

## 编辑工作台

- 后台只使用简体中文，不引入 i18n。208px 左侧导航可收起为图标栏，顶部提供面包屑、
  搜索、新建、主题与账户菜单；窄屏使用抽屉导航。Phosphor 图标与 Base UI 控件统一交互。
- 导航按工作台、内容、内容资源、编辑流程、成员、发布与运维分组，入口与动作仍由
  server permissions/actions 控制。搜索和摘要使用现有有界 API，明确标注已加载范围。
- Content 下四个类型入口复用同一张可筛选、cursor 分页的表格。创建后直接进入编辑器；
  Topic 仅 Admin 可创建，Tags 在独立管理页面创建/更新。
- Source / Preview / Split 使用 UIW source 输入和 react-markdown/GFM 安全预览。
  外部图片只显示 warning placeholder，不发起图片请求；无 H1/HTML 命令；Insert image 通过 Asset picker 和必填 alt 插入受控 URL。
- 空闲 1.7 秒保存完整 Draft，始终只有一个 PUT 在途；后续输入合并并使用新 version。
  Ctrl/Cmd+S、Submit 和 Direct Publish 复用同一个队列。409 后暂停自动重试，提供
  Copy、Inspect 和显式 Reload；离开未保存页面会提示。Draft 从不写浏览器存储。
- 审核始终显示 exact immutable Revision；反馈、resubmit、历史查看/恢复、归档和
  直接发布均沿用 P0-2 服务。编辑下一版不改变已发布 pointer。
- 跟随系统 / 浅色 / 深色与侧栏收起偏好可持久化。360px 下抽屉导航、内容属性堆叠。
  Monitor 是普通 Admin 链接；Assets 对 active roles 开放，Publication 仅 Reviewer/Admin。

生产构建包含所有 lazy chunks，仍由单个 Go 二进制提供。Vite 构建门禁拒绝 raw HTML
preview 或禁止的 editor/primitives 模块进入产物。工程决定见
[ADR 0007](docs/decisions/0007-admin-editorial-ux.md)。

新布局将正文置于视觉中心，右侧按基础/类型/搜索展示组织属性；版本与路径单独查看。
素材库复用图片选择器，标签用创建/编辑对话框，成员统一表格与资料表单；发布页先说明
同步状态，技术字段放入详情抽屉。UI 架构与约束见
[ADR 0010](docs/decisions/0010-admin-editorial-workspace.md)。本次未改变 Public、API、
数据库或发布语义，P0-6 导入与切换仍独立进行。

## Assets 与 Publication

图片按 bytes/header 检测 PNG/JPEG/WebP/GIF，最大 10 MiB、16384 px/边、100M 像素。
SHA-256 决定永久 key，同 bytes 去重、缓存一年 immutable，不保存原始本地文件名。
不剥离 EXIF/二进制 metadata。Admin soft delete 停止新选择，不删除 R2 对象。
封面与 Markdown 插入均进入原有 autosave，历史 Revision/已发布封面保持不变。

Publish/Unpublish、原本已发布内容的 Archive、公开内容使用的 Author/Tag 更新，在
同事务内递增 generation 并插入 durable job。Worker 合并旧 generation，上传私有
`snapshots/generation-N.json`，再写 `latest.json`，再 POST Hook。Hook 为至少一次投递；
失败退避，六次自动尝试后保留 failed，由 Reviewer/Admin Retry。只支持一个 active CMS writer。

development 的八个 P0-4 变量全部留空时，Worker disabled，公开 mutation 仍排队，
上传返回稳定 unavailable。部分配置会启动失败，production 必须配全。参见
[部署与恢复](docs/operations/deployment.md) 和 [Production 构建说明](docs/operations/cloudflare.md)。

本地 `make dev-web` / `make dev` 自动读取根 `.env`，不需要手工导出或映射环境变量。
输入优先级如下：

1. 显式 `CONTENT_SNAPSHOT_FILE` 最高优先；开发入口的相对路径统一从仓库根目录解析。
2. 使用 `CONTENT_R2_ENDPOINT / CONTENT_R2_BUCKET / CONTENT_R2_ACCESS_KEY_ID / CONTENT_R2_SECRET_ACCESS_KEY`。
3. 仅 Development（APP_ENV 未设或为 development）允许缺失字段分别 fallback 到
   `R2_ENDPOINT / R2_CONTENT_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY`。

如只想体验示例阅读站，在根 `.env` 填入：

```dotenv
CONTENT_SNAPSHOT_FILE=tests/fixtures/content-snapshot-v1.json
```

然后直接 `make dev-web`；若希望读取开发内容桶，把该字段留空，并配好上述 R2 字段。
没有 `latest.json` 会明确提示 `no published snapshot available`，不会悄悄改用 fixture。
此时先单独运行 CMS/Admin 发布开发快照，或显式选择 fixture 后再启动 `make dev`。
快照在启动时读取，重新运行 `dev-web` / `dev` 才载入新 generation；不会把 Draft 直接展示给读者。
Astro dev 不生成 Pagefind 索引，完整搜索应使用 fixture build 后的 preview。

Production / Cloudflare 的 `pnpm --filter @gopheratlas/web build` 行为不变：不读取根 `.env`、
不使用 CMS `R2_*` fallback，必须单独提供 `CONTENT_R2_*` read-only credential。
本地验证完整产物可运行 `make check`，它显式选择 fixture 并完成 build；随后运行
`pnpm --filter @gopheratlas/web preview`。不要为运行检查配置真实凭证。

构建校验 latest、SHA-256、Schema v1、Markdown 和引用图，输出忽略的 `.generated`
快照及 `/.well-known/gopheratlas-build.json`。`make check` 固定显式 fixture 并进行
synthetic secret-output scan。生产不配置 fixture fallback；内容桶始终私有，CMS RW
与 Web RO 凭据分离。实现与验证未使用真实 R2/Hook 或修改 Cloudflare/DNS。

## Public 阅读站与 P0-6 边界

`apps/web/src/lib/publication` 在构建时验证/索引公开实体与引用，模板不读取 Draft 或
私有 API。四类详情直接使用 snapshot 的 `canonicalPath`；另有首页、六类集合目录、
Note 分组、Tag、Author、about/contribute/search 和 404 页面。集合以 24 条静态分页，
不需要运行中的 CMS 或 Node。Curated 仅呈现推荐/来源元数据，不抓取原文。

构建命令一次生成 HTML、`_redirects`、RSS/sitemap/robots、Pagefind 和 build marker。
历史路径输出直接 301，超过 2,000 条或单行 1,000 字符即失败。Pagefind 仅索引详情与
两页源码维护的介绍内容，统一中文分词索引兼顾英文词；搜索页才加载浏览器代码。
正文复用共享 GFM/安全检查与 Shiki；SEO 使用覆盖值或 title/summary，语言保持真实。

本地构建后用 `pnpm --filter @gopheratlas/web preview` 查看完整产物（含 Pagefind）。
Astro preview 不模拟 Cloudflare `_redirects`；其内容由门禁检查，平台行为在发布验收
时确认。`node scripts/check-public-build.mjs` 检查核心 fixture 的实际页面与引用、
redirects/RSS/sitemap/search 索引、marker hash 和输出隐私，已接入 `make check`。

详见 [ADR 0009](docs/decisions/0009-public-static-publication.md)。P0-6 单独负责旧站
inventory/import、历史路由验证/超限方案、backup/restore drill、第一条真实导入后的
generation 验收、gopheratlas.com DNS cutover 和旧站下线决策。本阶段不修改生产配置。

## License

[MIT](LICENSE)。组件来源见 [Third-party notices](docs/third-party-notices.md)。

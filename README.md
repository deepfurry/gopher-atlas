# GopherAtlas

**Technical Journal × Knowledge Atlas** — 面向 Go 开发者的知识地图与多作者
Markdown 出版平台。

当前完成 **P0-1：CMS Runtime, Identity, Auth, Logging & Persistence**。
私有 CMS 已有身份、用户审批、持久会话、个人作者资料、日志和监控；内容编辑、
审阅、发布与 R2 仍未实现。详见 [阶段范围](docs/implementation-status.md)。

## 架构

```text
当前私有 CMS：Go / Fiber v3 + 内嵌 React Admin → SQLite / sqlc / goose
未来发布链路：CMS → 私有 R2 快照 → Astro 静态构建 → Workers Static Assets
                    └── 不可变 R2 图片 ──────────────→ 公共读者
```

公共站不在请求时依赖 CMS；私有服务器离线不影响读者。源码留在 Git，未来内容
通过 CMS 编辑与发布；about/contribute 页面继续随仓库维护。

| 目录                               | 当前职责                                                               |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `apps/web`                         | Astro 静态首页/about/contribute、空 RSS、sitemap、Pagefind 索引        |
| `apps/admin`                       | React/Vite、shadcn/Base UI、登录/待审批/个人资料/用户管理/Monitor 入口 |
| `packages/markdown`                | CommonMark/GFM 安全规则与共享 remark 插件                              |
| `packages/api-client`              | OpenAPI 生成类型、同源请求及 CSRF header                               |
| `cmd/gopheratlas-cms`              | 配置、共享 logger、SQLite、OAuth 服务的构造与关闭                      |
| `internal/app`, `internal/http`    | Fiber 中间件顺序、API、错误与 cookie 边界                              |
| `internal/auth`, `internal/policy` | 身份事务、会话和集中权限判断                                           |
| `internal/database`, `db`          | SQLite 连接池、真实 goose migrations 和 sqlc queries                   |
| `internal/adminui`                 | 编译进 Go 二进制的 Admin 生产静态文件                                  |

## 分支模型

日常功能从最新 `dev` 创建 feature 分支，PR 合入 `dev`。`main` 仅保存发布快照，
通过发布流程接收 `dev` 的已验收版本。禁止直接在 `dev` / `main` 开发。
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

分三个终端启动：

```sh
make dev-cms     # CMS: 127.0.0.1:46217
make dev-admin   # 浏览器: http://127.0.0.1:5173
make dev-web     # Public: http://127.0.0.1:4321
```

`make dev-cms` 通过 Node 的 `--env-file-if-exists=.env` 读取根 `.env`，已有进程变量
优先，缺失文件无妨。直接运行 Go 二进制只读 process env。检查和测试不加载 `.env`，
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

生产设置 `APP_ENV=production`、`CMS_BASE_URL=https://blog.go-furry.com`，回调为
`https://blog.go-furry.com/api/auth/github/callback`。生产必须提供完整 OAuth 配置和
正整数 bootstrap ID，并通过 Tailscale HTTPS 访问。OAuth token 仅用于 `/user`
身份解析，之后丢弃，不入库。测试只连接本地 fake provider。

- GitHub numeric ID 是身份主键，login 可更新。作者 slug 为 `github-<numeric-id>`，
  P0-1 不可改名；显示名称、Markdown 简介和网站可编辑。
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

`/healthz` 只表示进程存活；`/readyz` 检查 SQLite 和 P0-1 migration/列集合，缺失或
不兼容返回 503。GitHub 是否在线不影响 readiness。`/ops/monitor` 只有 active
Admin 能打开；一个 app-wide Monitor 包裹业务请求，Recover 在其后。

一个共享 Zap logger 同时写 JSON 到 stdout 和 Lumberjack JSONL 文件。默认
`./logs/cms.jsonl`，100 MB / 10 份 / 30 天 / 压缩；`LOG_*` 可配置。contrib Zap 只记
`latency/status/method/path/request_id`，不记 query、body、IP、UA、cookie、Authorization
或错误原文。health/readiness/Monitor 不写 access log。反向代理也必须避免记录
OAuth query。生产部署和代理配置尚未执行。

## 验证与生成

```sh
make generate        # OpenAPI → TS，真实 migrations/queries → sqlc
make check           # 最终统一门禁
```

门禁包括边界检查、gofmt/vet/staticcheck、Go 身份/数据库/HTTP 测试、前端 lint/
类型/身份 UI 测试、OpenAPI 和生成漂移、goose/sqlc 隔离验证、Public 构建，以及
Admin 生产构建后的 embed 测试和最终 Go 二进制编译。Linux CI 另外执行
`go test -race -tags=adminembed ./...`。sqlc 输出与 TS schema 必须经生成，不手改。

## 设计与工程上下文

Public 采用技术刊物的阅读层级、自托管 Geist/JetBrains Mono、暖纸/石墨主题，
不使用 shadcn；Admin 为紧凑的 Base UI 工作台。见 [设计合同](contracts/design.md)、
[设计系统](docs/design-system.md)、[AGENTS.md](AGENTS.md)、[架构](.agents/architecture.md)
及 [ADR](docs/decisions/README.md)。

P0-2 再实现 Content/Draft/Revision、Review/Publish、Tags/Topics、routes、audit 和
乐观并发。R2 快照、Cloudflare hook、旧站导入和生产切换仍属于之后阶段。

## License

[MIT](LICENSE)。组件来源见 [Third-party notices](docs/third-party-notices.md)。

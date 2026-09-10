# GopherAtlas

**Technical Journal × Knowledge Atlas** — 面向 Go 开发者的知识地图与多作者
Markdown 出版平台。

当前完成阶段是 **P0-0：Repository Bootstrap & Engineering Foundation**。
这里是全新平台的工程骨架，尚无登录、数据库业务表、内容编辑或发布能力。
详见 [阶段范围](docs/implementation-status.md)。

## 架构

```text
私有控制平面（未来）                       公共平面
Go / Fiber v3 + 内嵌 React Admin
              ↓
SQLite / sqlc / goose → 私有 R2 快照 → Astro 静态构建 → Workers Static Assets
              └─────→ 不可变 R2 图片 ─────────────────→ 公共读者
```

公共站不在请求时依赖 CMS；私有服务器离线不影响读者。源码留在 Git，未来内容
通过 CMS 编辑与发布；about/contribute 页面继续随仓库维护。

| 目录                              | 当前职责                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `apps/web`                        | Astro 6 + Tailwind 4；静态首页/about/contribute、空 RSS、sitemap、Pagefind 索引 |
| `apps/admin`                      | React 19 + Vite；shadcn/Base UI、React Router、TanStack Query 连接预览          |
| `packages/markdown`               | CommonMark/GFM 语法与安全规则、共享 remark 插件                                 |
| `packages/api-client`             | OpenAPI 生成的类型与 same-origin 请求客户端                                     |
| `cmd/gopheratlas-cms`, `internal` | Go/Fiber v3 装配、配置、HTTP 存活检查                                           |
| `db`, `sqlc.yaml`                 | 后续 goose/sqlc 输入位置；当前仅运行隔离的工具验证样例                          |
| `contracts`, `docs/decisions`     | 机器接口、工程约束与架构决定                                                    |

## 本地开始

需要 Git、GNU Make、Node **24.15.0**、pnpm **12.3.4**、Go **1.26.8**。
版本由 `.node-version`、`.go-version`、`packageManager` 固定。Go 检查脚本会选择
固定工具链；第一次运行会下载 Go、sqlc、goose 和 staticcheck，需能访问依赖源。
Windows 可在 PowerShell 中运行（例如用 Chocolatey 安装 GNU Make）；不要求 WSL。

pnpm 12 的安装策略位于 `pnpm-workspace.yaml`：保留精确版本保存、严格 engine
检查、pnpm 10 原有的无发布等待期策略（`minimumReleaseAge: 0`），并仅允许
esbuild/sharp 执行依赖构建脚本。显式保留等待期策略可避免新默认值拒绝已有的
锁定版本，无需改动应用依赖。`.npmrc` 仅用于 registry/auth
配置。CI 使用支持 pnpm 12 的 `pnpm/action-setup@v6.1.0`，从根 `packageManager`
读取版本。旧版启动器不能自动切换时，先按 [pnpm 官方安装说明](https://pnpm.io/installation)
安装 pnpm 12，再运行下面的命令。

```sh
pnpm install --frozen-lockfile
go mod download
make check
```

分三个终端启动：

```sh
make dev-cms     # http://127.0.0.1:46217/healthz
make dev-admin   # http://127.0.0.1:5173
make dev-web     # http://127.0.0.1:4321
```

Admin 开发服务器将 `/healthz` 转发到本地 CMS。CMS 不运行时，Admin 显示连接
失败并可重试；Public 构建与阅读不受影响。CMS 的未知 API/Monitor/readiness 路径
返回 JSON 404，尚未提供鉴权或持久化就绪检查。

无需创建 `.env` 即可运行所有检查。已有 `.env` 不会被脚本自动加载。
`.env.example` 仅列安全默认值和空占位；P0-0 仅消费 `CMS_LISTEN_ADDR`。
可在启动进程前设置该变量；必须是 loopback IP 和 1024–65535 端口。
更改端口时同步修改 Admin 开发代理。OAuth/R2/Cloudflare 的实际凭据不属于本阶段。

## 验证与生成

```sh
pnpm lint
pnpm typecheck      # 递归包检查，包含 astro check
pnpm test
pnpm build          # 递归构建；包含 RSS、sitemap 和 Pagefind
make generate       # 从 OpenAPI 生成 TS；有真实 SQL 后生成 sqlc
make check          # 最终统一门禁
```

`make check` 执行边界/环境检查、gofmt、go vet、staticcheck、Go 测试与构建、
ESLint/Prettier、TS/Astro 检查、Vitest、OpenAPI 校验、JSON Schema 样例与拒绝测试、
生成漂移检查、临时 SQLite goose up/down、sqlc 样例生成，以及完整前端构建和
产物检查。CI 复用它，并在 GitHub 托管 Linux 上额外运行 race 检查。

`contracts/openapi.yaml` 是 API 源，`packages/api-client/src/generated` 是提交的
生成产物。不要手改。业务 SQL 尚未实现，所以运行时 sqlc 漂移检查会明确报告
无输入；工具链仍在临时目录实际执行。P0-1 加入 SQL 后自动启用生成漂移比较。
未来手动迁移命令为 `make db-status` / `make db-up`，必须显式设置 `DATABASE_PATH`；
CMS 启动不会执行迁移。测试不会使用这个变量或本地数据库。

## 设计与工程上下文

Public 采用技术刊物的阅读层级、自托管 Geist/JetBrains Mono、暖纸/石墨主题，
不使用 shadcn。Admin 使用紧凑、平静的编辑工作台视觉与 Base UI primitives。
两端约束见 [设计合同](contracts/design.md) 和 [设计系统](docs/design-system.md)。

修改前阅读 [AGENTS.md](AGENTS.md)、[架构](.agents/architecture.md)、
[工作流程](.agents/playbook.md) 与相关 [ADR](docs/decisions/README.md)。
工程理念参考 [DeepFurry Agent Engineering Template](https://github.com/deepfurry/agent-engineering-template)，
约束与目录内容针对本项目独立编写。

P0-1 接续 SQLite、身份/权限、OAuth/session/CSRF、Zap/Lumberjack、contrib
Zap/Monitor、readiness 和 Admin 嵌入。内容工作流、R2 发布、完整公共站、旧站导入
及生产部署分别属于后续阶段，本次没有实现或部署它们。

## License

[MIT](LICENSE)。组件来源见 [Third-party notices](docs/third-party-notices.md)。

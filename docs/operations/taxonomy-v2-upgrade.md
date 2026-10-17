# B2 / B3 分类升级操作说明

## 已确认进度（2026-10-17）

B2 开发交付时仅有合成库验证，生产升级尚未执行；前置 B1 Public `9236209`
已先行部署并验证原 v1 输入。此后真实生产一致性备份的 B3 离线迁移演练通过：plan
无冲突、00004 前后 fingerprint 一致，历史正文/Revision/审核/标签关联/路由保留，
重复 apply 被拒绝，v2 导出、B1 消费者校验及 Astro 静态构建成功。原始备份未修改。

用户随后确认实际生产升级完成，main/CMS 为
`ad73db37c70946c8f8b5087103b462f53822a6c3`：Schema 3→4，`taxonomy_state.ready=1`，
publication generation 14→15；内容 13、Revision 15、标签 14、分组 4、历史路由 11。
数据库 integrity_check 为 `ok`、外键错误 0；生产数据本地 Snapshot v2 导出验证通过；
`make prod-update` 成功，systemd active，healthz/readyz 正常。
更新后备份为 `20261017T145739Z.nizHXb`。

**用户已另行确认公开站 Snapshot v2 / generation 15 Marker，commit 为 `ad73db3`；
生产灾难恢复演练仍未完成。** 四个完整字段及快照哈希见
[公开 Marker 验收补记](production-runbook.md#公开-marker-验收补记)。
离线迁移演练、CMS 部署、本地导出、公开同步与灾难恢复必须分别记录，不能互相代替。
完整时间线见[生产操作手册](production-runbook.md)。以下保留可审查的操作流程，
不是要求对已完成初始化的生产库重新执行 apply；后续生产操作仍须单独授权。

## 工具与只读预检查

在已核对的 B2 提交构建工具；不用 `.env`，不需要 OAuth/R2/Cloudflare 凭证：

```sh
go build -o .cache/bin/gopheratlas-taxonomy ./cmd/gopheratlas-taxonomy
.cache/bin/gopheratlas-taxonomy -mode plan -database /protected/copy/gopheratlas.db -output /protected/reports/taxonomy-plan.json
```

Windows 工具名加 `.exe`，用 PowerShell 的绝对路径。报告路径必须不存在；工具拒绝
覆盖已有文件。DB 必须已存在。plan/export 以 SQLite `mode=ro` + `query_only` 打开；
不执行迁移、创建分组或连接任何对象存储。报告只有分类元数据、源 Content ID、
Draft version / published Revision ID、generation、fingerprint 和冲突，不含正文。
报告仍应放在受保护目录，不提交到 GitHub。

B3 中原始解压目录设置只读 ACL 后，WAL 模式 DB 因缺少可创建的辅助文件而无法
由普通 `mode=ro` 打开；在字节校验一致的独立工作副本执行 plan 成功。保留原件及
校验值，不为解决该限制放宽原始备份权限；只读查询不等于 SQLite 完全不需要目录权限。

plan 支持 schema 3 和 4。检查所有 Draft 的非空 groupSlug，以及活跃内容选中的
已发布 Note Revision；未分组草稿计入 skippedDrafts。无效/不完整元数据及同 Slug 的
名称、说明、顺序差异列入 issues，退出非零；**禁止挑第一条继续、改写历史或造分组**。
已知的可编辑 Draft 差异可先在旧 CMS 中人工核对修正，再停机、备份、重新 plan。
若已发布来源相互冲突或原名称不能确定，应停止，另行审查数据修复方案；本工具不提供
覆盖参数。未选中的历史 Revision 不作为当前权威，但保持完整且可读。

## 必须先在受保护副本演练

1. 从一致性备份制作独立副本；不得对在线 DB 单独复制 `.db` 而遗漏 WAL 边界。
   记录旧二进制、提交、generation、latest/marker 的版本及哈希；不要把凭证写入报告。
2. 保留原副本，另取工作副本执行 plan。比较 tags ID/Slug、所有 Draft/Revision/review、
   routes、日期、正文摘要；记录完整性和外键检查结果。
3. 对工作副本显式迁移，再以审核后的 fingerprint 和已有 active Admin ID apply：

   ```sh
   DATABASE_PATH=/protected/work/gopheratlas.db make db-status
   DATABASE_PATH=/protected/work/gopheratlas.db make db-up
   .cache/bin/gopheratlas-taxonomy -mode apply -database /protected/work/gopheratlas.db -writer-stopped -actor-id <已有AdminID> -fingerprint <plan中的64位指纹> -output /protected/reports/taxonomy-applied.json
   .cache/bin/gopheratlas-taxonomy -mode export -database /protected/work/gopheratlas.db -output /protected/reports/snapshot-v2.json
   ```

   上面的 `<...>` 必须替换后才能执行。PowerShell 可临时设置进程 `DATABASE_PATH`
   后调用 make，完成后恢复原环境；不能依赖根 `.env` 选择迁移目标。

4. 用现有 Node 消费者验证导出的完整文件，并离线构建 Public：

   ```sh
   node --input-type=module -e 'import {readFileSync} from "node:fs"; import {validateSnapshot} from "./scripts/snapshot.mjs"; validateSnapshot(readFileSync(process.argv[1])); console.log("v2 validated");' /protected/reports/snapshot-v2.json
   CONTENT_SNAPSHOT_FILE=/protected/reports/snapshot-v2.json pnpm --filter @gopheratlas/web build
   ```

   该快照是**本地演练的显式构建输入**，不得上传成为生产替代输入或写入生产构建配置。
   验证中英文标签/分组与 SEO、文章原路径、redirects、评论 term、RSS/sitemap/Pagefind。

5. 再次比较旧业务历史行；apply 只新增分组/Audit、更新 taxonomy_state、推进一次
   generation 并新增 job。旧标签不改，不猜英文；不生成文章 Revision。第二次 apply
   明确返回 already initialized，不再写入。无分类数据的新空库可直接由 00004 初始化。
6. 在独立副本测试故障恢复：保留原工作副本和产物，不以 `goose down` 删除新分类或 Audit；
   从原备份另建副本重复演练，记录失败阶段及结果。该离线过程不替代恢复生产服务、登录及
   外部发布状态的灾难恢复验收，见[备份与恢复边界](backup-restore.md)。

## Linux 服务账户与迁移文件权限

2026-10-17 实际升级遇到的权限问题：`ops` 是仓库操作用户，生产数据库由
`gopheratlas` 账户访问，不能直接以 `ops` 运行数据库迁移。切换执行账户后还须确认
迁移 SQL 可读；只有数据库权限正确，并不足以让 Goose 成功读取迁移文件。

- 由操作用户在审核提交上准备 Linux Goose/taxonomy 二进制；Goose 版本及构建参数
  沿用 `scripts/tools.json`、`scripts/lib.mjs`，SQL 使用同提交的完整 `db/migrations`。
  服务账户无需继承 `ops` 的 HOME、Go 缓存、私有环境变量或生产凭证。
- 将审核后的工具/SQL 放在服务账户可访问的受控目录，核对每级父目录的遍历权限、
  二进制执行权限、SQL 读取权限。可按既有权限策略使用管理员拥有、服务组只读/执行的
  目录及文件；不要使服务账户可改写迁移 SQL，也不要递归开放整个仓库或备份目录。
- DB 及其目录由服务账户按 SQLite 要求读写，包含 WAL/SHM 的创建；报告目录仅授权
  必要账户写入。原始备份继续受保护。不要使用 `chmod 777` 或将生产 DB 改属 `ops`。
- 检查实际 systemd `User`/`Group`，以正确服务账户通过 `sudo -u gopheratlas --`
  调用工具；`make prod-update`/构建仍由仓库所有者运行，不要混为同一个执行身份。
  若直接以服务账户运行 `make db-*`，还必须满足仓库、Node/Go、缓存与 SQL 的访问条件。

以下仅为受控目录准备后的命令模板，绝对工具/SQL/报告路径须替换为已核对的路径，
不是本次生产操作的逐条终端记录。不要加载 `cms.env` 或让 Goose 自动读取 `.env`：

```sh
sudo -u gopheratlas -- /absolute/path/to/goose -env none \
  -dir /absolute/path/to/migrations sqlite3 /srv/gopheratlas/data/gopheratlas.db status
sudo -u gopheratlas -- /absolute/path/to/gopheratlas-taxonomy \
  -mode plan -database /srv/gopheratlas/data/gopheratlas.db \
  -output /absolute/private/reports/taxonomy-plan.json
```

仅在已授权、已停写、已备份且 plan 无冲突的迁移窗口，才以同一身份运行 Goose `up`
及 taxonomy `apply`；`-actor-id` 是库中已有 active Admin 的业务 ID，不是 Linux UID。
`-writer-stopped` 必须对应实际停写事实，不能把离线副本的确认沿用到在线生产库。

## 生产窗口（须另行批准）

操作员先审查当前 `scripts/production.sh`、systemd 单元、数据库绝对路径、部署提交、
磁盘空间、文件所有者及恢复方案。构建可提前在非生产环境完成；不要让未知旧/新二进制
在迁移过程中写库。**停止唯一 CMS writer 并确认已停止**，保留停机期间的一致性
SQLite 数据目录备份（DB/WAL/SHM 边界）、旧二进制及发布状态，再重复最终 plan。
备份工具若自动重启服务，必须再次停服务后才能执行迁移。

在明确的生产路径上按审核后的顺序：`db-status` → `db-up` → `plan` 复核指纹 →
`apply` → 完整性/外键/业务历史比对 → 本地 v2 export 检查 → 安装并启动新 CMS。
新库为 SQLite **4**，内容 payload 仍为 **1**，公开快照为 **2**。00004 在已有库中
设置未就绪；apply 成功后才允许新 CMS 启动，不会靠 readiness 自动迁入数据。

`make prod-update` **不做数据库迁移，而且最终会启动 CMS**；不能在上述迁移完成前
执行它，也不能把它当作安全升级的一条命令。确认迁移与 apply 都成功后，操作员才可
按现有维护文档选择该命令安装已审核代码。此次任务不运行这些生产命令。

新 CMS 启动后会处理新的 generation；这不会重新发布文章或改写 Revision，但会导出
v2 全量快照并走既有 R2/Hook 流程。检查登录、标签/分组权限与搜索、已有编辑器/专注模式、
图片插入、审核/历史、旧 URL/301 和 Giscus term；确认 latest、immutable snapshot 与
build marker 的 schemaVersion/generation/hash 一致，中英文目录/详情正常。

若失败，先停止 writer 和后续发布。不要清库、强行 Down、手改 Revision、覆盖已有
`snapshots/generation-N.json` 或手动回写 latest。尚未发生外部发布时，可在确认数据库、
旧二进制和外部 generation 全部一致的前提下恢复整套停机备份。若新 generation 已上传
或 Hook 已接受，必须先核对外部发布高水位，再制定保持 generation 单调递增的恢复方案；
不能直接恢复旧 DB 后重用已占用的 generation。生产恢复不由本工具自动实施。

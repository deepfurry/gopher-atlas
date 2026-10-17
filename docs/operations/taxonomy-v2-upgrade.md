# B2 / B3 分类升级操作说明

本次交付只开发 B2；以下生产步骤是供人工复核的 B3 方案，**未执行**。
前置条件是 B1 Public `9236209` 已部署并验证原 v1 输入。本次没有拿到受保护的
生产数据库副本；合成临时库测试不能替代该副本演练。

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
后调用 make，完成后恢复原环境；不能依赖根 `.env` 选择迁移目标。4. 用现有 Node 消费者验证导出的完整文件，并离线构建 Public：

```sh
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {validateSnapshot} from "./scripts/snapshot.mjs"; validateSnapshot(readFileSync(process.argv[1])); console.log("v2 validated");' /protected/reports/snapshot-v2.json
CONTENT_SNAPSHOT_FILE=/protected/reports/snapshot-v2.json pnpm --filter @gopheratlas/web build
```

该快照是**本地演练的显式构建输入**，不得上传成为生产替代输入或写入生产构建配置。
验证中英文标签/分组与 SEO、文章原路径、redirects、评论 term、RSS/sitemap/Pagefind。5. 再次比较旧业务历史行；apply 只新增分组/Audit、更新 taxonomy_state、推进一次
generation 并新增 job。旧标签不改，不猜英文；不生成文章 Revision。第二次 apply
明确返回 already initialized，不再写入。无分类数据的新空库可直接由 00004 初始化。6. 测试故障恢复：保留原工作副本和产物，不以 `goose down` 删除新分类或 Audit。
通过原备份重新制作新副本重复演练。记录失败阶段及结果。

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

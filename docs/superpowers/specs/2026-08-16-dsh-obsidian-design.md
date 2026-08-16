# dsh-obsidian 设计文档

- 日期：2026-08-16
- 状态：已确认（待实现）
- 参考插件：`dsh-notion-mcp`（本地 `/Users/admin/Mingdom/dsh-notion/`）

## 1. 背景与目标

`deepseek-harness`（dsh）是一个「一切皆插件」的 agent harness，底层是 vendored 的 Cordis。第三方插件以 npm「bundle」形式发布，通过 `dsh plugin --profile <profile> add <pkg>` 安装。

**目标**：让 dsh（agent）能读写/检索用户本地指定的 Obsidian vault。Obsidian vault 本质是本地一坨 Markdown 文件 + `.obsidian/` 配置，因此不需要 Notion 那套 MCP + OAuth，直接用文件系统访问即可，并可选地借助 Obsidian 官方 CLI 获得「Obsidian 感知」能力（反链、链接感知移动等）。

**非目标（YAGNI，明确不做）**：
- Bases 数据库、Canvas（用户 vault 中不存在）
- 日记系统（daily notes）——除非后续有需求
- dsh skill 伴随提示词（v1 只做类型化 tools）
- `dsh obsidian ...` CLI 子命令（无鉴权需求，暂不做健康检查命令）

## 2. 包形态（对齐 dsh-notion）

- npm 包名：`dsh-obsidian`
- `package.json` 关键字段：
  - `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`
  - `type: "module"`，`main: "lib/index.js"`，`types: "lib/index.d.ts"`，`exports["."]`
  - `files: ["lib", "cordis.patch.yml", "README.md"]`
  - 构建：`tsdown`（`entry: ['src/index.ts'], format: ['esm'], dts: true, outDir: 'lib'`）
  - `peerDependencies`: `@deepseek-ai/cordis`、`@deepseek-ai/schemastery`
  - `dependencies`: `yaml`（frontmatter 解析）
  - `engines.node >= 22.12.0`
  - `keywords`: `dsh`, `dsh-plugin`, `obsidian`, `deepseek-harness`
- `cordis.patch.yml`:
  ```yaml
  - insert:
      - id: obsidian
        name: dsh-obsidian
  ```
- 导出约定：命名导出 `name` / `inject` / `Config` / `apply`，**无 default export**（dsh 硬约定，default export 会丢 inject）
- `inject: ['tools']`

## 3. Config

```ts
export const Config = z.object({
  vaultPath: z.string().optional().describe('绝对路径；留空则按平台从 obsidian.json 自动探测'),
  useCli: z.boolean().default(true).describe('CLI 可用时，反链/移动等操作委托给 obsidian CLI'),
  excludeDirs: z.array(z.string()).default(['.obsidian', '.git', '.trash']).describe('搜索/列出时排除的目录'),
})
```

自动探测：按平台读取 Obsidian 应用配置，取 `"open": true` 的 vault 路径。
- macOS: `~/Library/Application Support/obsidian/obsidian.json`
- Windows: `%APPDATA%/obsidian/obsidian.json`
- Linux: `~/.config/obsidian/obsidian.json`

## 4. 工具集（tools，前缀 `obsidian_`）

所有工具通过 `ctx.tools.register(defineTool({...}))` 注册。路径均为**相对 vault 根**的路径。

### 读

| 工具 | 参数 | 返回 |
|---|---|---|
| `obsidian_list` | `dir?`(相对目录), `glob?`, `limit?`(默认 200) | `[{ path, title }]` |
| `obsidian_search` | `query`(必填), `dir?`, `context?`(前后行数, 默认 1), `limit?`(默认 50) | `[{ path, line, lineNumber, contextBefore[], contextAfter[] }]` |
| `obsidian_read` | `path`(必填) | `{ path, title, frontmatter?, content }` |
| `obsidian_frontmatter` | `path`(必填) | frontmatter 解析对象 + `raw` |
| `obsidian_backlinks` | `path`(必填) | `[{ path, title, snippet }]` 链接到该笔记的笔记 |

### 写

| 工具 | 参数 | 语义 |
|---|---|---|
| `obsidian_write` | `path`(必填), `content`(必填) | 新建或覆盖；父目录不存在则创建 |
| `obsidian_append` | `path`(必填), `content`(必填) | 追加到末尾 |
| `obsidian_move` | `from`(必填), `to`(必填) | 移动/重命名；CLI 可用时让链接自动更新 |
| `obsidian_delete` | `path`(必填) | **移入 vault 的 `.trash/` 目录（可逆），绝不永久删除** |

删除语义：移动到 `.trash/`（不存在则创建），保留原始相对路径，目标已存在时追加时间戳避免覆盖。不做永久删除、不提供 `--force`。

`obsidian_read` 仅接受路径（不做标题解析，标题冲突有歧义）。需要按标题找笔记时，agent 先用 `obsidian_search` / `obsidian_list` 定位。

## 5. 访问层（A+B 混合核心）

定义 `VaultAccess` 接口（`read/list/search/frontmatter/backlinks/write/append/move/delete`），两个实现：

- `FsAccess`：`node:fs` + 自写 frontmatter / wikilink 解析。**永远可用，是基线。**
- `CliAccess`：`child_process` 调 `obsidian` CLI。**仅当 `useCli && cliAvailable()` 时启用**，且只委托 Obsidian 感知操作（`backlinks`、`move`），其余一律走 fs。

工厂 `detectAccess(ctx, config)`：
- 解析 vault 根（显式 `vaultPath` 优先，否则自动探测）
- `useCli && cliAvailable()` → 混合（fs 为主，backlinks/move 走 CLI）
- 否则纯 fs

CLI 检测：`spawn('obsidian', ['version'])` 成功即视为可用，结果缓存；CLI 调用失败时回退到对应 fs 实现（不抛错打断 agent）。

### frontmatter / wikilink 解析（FsAccess 内）

- frontmatter：文件开头 `---` 到 `---` 之间的 YAML，用 `yaml` 包解析
- wikilink：识别 `[[目标]]` 与 `[[目标|别名]]`，目标可为 `标题` 或 `folder/标题`；反链匹配用笔记 basename（去扩展名）或标题

### 搜索实现

`rg` 可用时 `spawn('rg', ['-n', '--no-heading', ...])`；否则 JS 递归扫描（`node:fs` `recursive: true`）+ 逐行匹配。始终排除 `excludeDirs`。

## 6. 安全模型

- **路径穿越防护**：所有入参路径 `path.resolve(vaultRoot, rel)` 后必须落在 `vaultRoot` 内，否则拒绝并返回错误
- 不碰 `.obsidian/`（除非任务明确是配置工作）
- 删除只进 `.trash/`，可逆
- 保护 frontmatter 和 wikilink（除非任务明确要求改）
- 搜索/列表限制条数，防大 vault 刷爆上下文

## 7. 数据流与错误处理

```
模型 → ctx.tools 分发 → tool.execute(args, exec) → VaultAccess.<method> → 结果 → output.render
```

错误处理：vault 未配置/未找到 → 明确报错并提示如何配置 `vaultPath`；路径越界/不存在 → 结构化错误；CLI 不可用 → 静默回退 fs（backlinks/move 退化为 fs 版本，不更新链接）。

## 8. 测试

- `FsAccess`：临时目录构造 fixture vault，测 read/list/search/write/append/move/delete/frontmatter/backlinks
- frontmatter / wikilink 解析单测
- 路径 guard（越界拒绝）单测
- CLI 检测与回退：打桩 `spawn`，测 CLI 可用/不可用分支
- 每个 tool 的 schema + execute 冒烟测试

## 9. 发布与贡献

1. `git init` + GitHub 仓库，加 `dsh-plugin` topic
2. `npm publish`（预构建，免 `allowBuilds` 授权）
3. 给 awesome-dsh-plugin 提 PR：`README.md` 与 `README.zh.md` 各加一行，归到 **Tools & Capabilities** 分类
   ```
   - [owner/dsh-obsidian](https://github.com/owner/dsh-obsidian) - Connect DeepSeek Harness to a local Obsidian vault: search, read, write, move, and trash notes.
   ```

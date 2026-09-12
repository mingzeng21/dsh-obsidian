# dsh-obsidian

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）连接到本地 [Obsidian](https://obsidian.md) vault。因为一个 Obsidian vault 本质上就是磁盘上的一堆 Markdown 文件，所以你的 `dsh` agent 可以直接搜索、读取、写入、移动和删除（移入回收站）笔记——**不需要 MCP server，也不需要 OAuth**。

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Node: >=22.12.0](https://img.shields.io/badge/Node-%3E%3D22.12.0-339933.svg)](https://nodejs.org) [![dsh: v0.1.5-alpha.1 verified](https://img.shields.io/badge/dsh-v0.1.5--alpha.1%20verified-2ea44f.svg)](https://github.com/deepseek-ai/deepseek-harness)

中文 | [English](README.en.md)

## 它能帮你做什么

装上 `dsh-obsidian` 后，你的 `dsh` agent 就能直接读写本地 Obsidian vault。插件会在启动时自动探测你的 vault（或读取你显式配置的路径），然后把 12 个 `obsidian_*` 工具挂载给 agent，覆盖搜索、读取、写入、追加、移动、删除和反链查询等日常操作。

## 特性

- **零依赖服务器** —— 直接读写 vault 文件系统，无需 Local REST API 社区插件，也无需常驻 MCP server。
- **默认安全** —— 删除只把笔记移入 `.trash/`（可逆）、路径无法越出 vault 根目录、绝不触碰 `.obsidian/`。

## 工作原理

```text
dsh agent 调用 obsidian_* 工具
   │
   ▼
VaultAccess 接口
   └─ FsAccess —— node:fs + 自研 frontmatter/wikilink 解析（默认，纯文件系统）
```

启动时插件按「显式 `vaultPath` 优先，否则从 `obsidian.json` 自动探测」解析 vault 根目录；`useCli` 开启且检测到 CLI 时，`property:set`/`property:remove` 委托给 CLI，其余操作始终走 `FsAccess`，任何 CLI 失败都会静默回退到 `FsAccess`。

## 安装

```sh
dsh plugin --profile web add dsh-obsidian
```

把 `web` 换成你运行 agent 所用的 profile（`web`、`headless`、`tui` 等）。

## 更新

重跑 `add` 即会拉取最新版（`latest`）：

```sh
dsh plugin --profile web add dsh-obsidian
```

或锁定具体版本：

```sh
dsh plugin --profile web add dsh-obsidian@0.2.5
```

更新后重启 harness（`dsh web`）或刷新 Web UI；用 `dsh plugin --profile web list` 确认版本。

## 卸载

```sh
dsh plugin --profile web remove dsh-obsidian
```

## 配置

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `vaultPath` | （自动探测） | vault 的绝对路径；留空则按平台从 `obsidian.json` 自动探测当前打开的 vault |
| `useCli` | `false` | 可用时把 `property:set`/`property:remove` 委托给 `obsidian` CLI |
| `excludeDirs` | `[".obsidian", ".git", ".trash"]` | 搜索/列出时排除的目录 |

### 路径与 Windows 兼容性

- 工具返回的路径始终是相对于 vault 根目录、使用 `/` 的路径；输入可以使用 `/` 或 `\\`。
- 工具路径参数必须是相对路径。Unix 绝对路径、Windows 盘符路径和 UNC 绝对路径都会被拒绝；配置中的 `vaultPath` 可以是 Windows 本地路径或 UNC vault 根目录。
- Windows 上笔记路径按大小写不敏感处理，并识别 `.md`、`.MD` 等大小写变体；Unix 保持大小写敏感与 `.md` 语义。
- 搜索会去除 CRLF 的 `\\r`，保留 Unicode 路径和正文；`ripgrep` 只是可选加速器，不可用或执行失败时自动使用内置扫描。
- vault 自动探测优先使用当前平台的 `obsidian.json` 位置（Windows `%APPDATA%`、macOS `Library/Application Support`、Linux `.config`），再尝试其他已知位置。CLI 支持 `.exe`/`.cmd` 形式，不可用时自动回退文件系统实现。

## 工具

| 工具 | 作用 |
| --- | --- |
| `obsidian_list` | 列出 vault 里的笔记（可按子目录过滤、限制条数） |
| `obsidian_search` | 全文检索，返回匹配行 + 上下文（大小写不敏感；Windows 识别 `.md` 大小写变体） |
| `obsidian_read` | 读取一篇笔记（正文 + 解析后的 frontmatter） |
| `obsidian_frontmatter` | 只读笔记的 YAML 属性 |
| `obsidian_backlinks` | 找出链接到某篇笔记的笔记（`[[wikilink]]`） |
| `obsidian_write` | 新建或覆盖一篇笔记（父目录不存在时自动创建） |
| `obsidian_append` | 向笔记末尾追加内容 |
| `obsidian_move` | 移动/重命名笔记（纯文件系统同步更新 `[[链接]]`） |
| `obsidian_delete` | 把笔记移入 `.trash/`（可逆，绝不永久删除） |
| `obsidian_set_property` | 设置或更新笔记的单个 frontmatter 属性（YAML） |
| `obsidian_delete_property` | 删除笔记的某个 frontmatter 属性 |
| `obsidian_tags` | 列出 vault 中所有标签及使用次数 |

所有工具的路径参数都相对于 vault 根目录（例如 `Folder/Note.md`）；返回给 agent 的路径统一使用 `/`。

## 安全性

- **路径越界防护** —— 所有路径参数都会解析并校验必须落在 vault 根目录内，越界（`../`、Unix/Windows 绝对路径或 UNC 路径）一律拒绝。
- **删除可逆** —— `obsidian_delete` 只把笔记移入 vault 的 `.trash/`，绝不永久删除。
- **不碰 `.obsidian/`** —— 搜索与列出默认排除 `.obsidian/`、`.git/`、`.trash/`。
- **保护 frontmatter 与 wikilink** —— 读取/写入不会破坏 YAML 属性和 `[[链接]]`（除非任务明确要求改）。

## 环境要求

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）
- Node.js ≥ 22.12.0

已完成对 `dsh` v0.1.5-alpha.1 的兼容验证（含 v0.1.3-alpha.2、v0.1.3-alpha.1、v0.1.2-rc.1、v0.1.2-alpha.5、v0.1.2-alpha.4、v0.1.2-alpha.3、v0.1.2-alpha.2、v0.1.2-alpha.1、v0.1.1-rc.2 与 v0.1.0-rc.8）。

## 开发

```sh
npm install
npm run build      # tsdown → lib/
npm run typecheck  # tsc --noEmit
npm test           # vitest
```

## 更新日志

### 0.2.5

- 修复 Windows 下 `.cmd` 命令脚本被重复加引号的问题，路径或参数包含空格、Unicode 字符时也能正确调用。

### 0.2.4

- 全面加固 Windows 兼容性：agent-facing 路径统一使用 `/`，同时接受 `\\` 输入，并拒绝盘符/UNC 绝对路径越界。
- 修复 Windows 下搜索、反链、移动/删除返回路径与 wikilink 重写；覆盖 CRLF、Unicode 和 `.MD` 等大小写扩展名。
- 支持 Windows `.exe`/`.cmd` 形式的 `ripgrep` 与 Obsidian CLI；外部命令不可用或失败时自动回退到内置实现。

### 0.2.3

- 修复 `dsh` v0.1.2-alpha.2/alpha.3 移除 `@deepseek-ai/dsh-tools` 的 `JsonValue` 转出后，插件源码无法 typecheck/build 的兼容性问题；保留对旧版 dsh 的兼容。

### 0.2.2

- `obsidian_tags` 与内联 `#标签` 提取支持中文等 Unicode 字符。
- `obsidian_backlinks` / `obsidian_move` 按 Obsidian 规则唯一解析 `[[链接]]`：同名笔记不再被误判，歧义链接不再被误改。
- `obsidian_set_property` / `obsidian_delete_property` 编辑属性时保留原有 YAML 注释、锚点/别名与多行格式，不再整块重写。
- 稳定性：`obsidian_move` 链接更新改为原子写；跨文件系统移动/删除自动回退；搜索在有/无 ripgrep 时结果一致。

## 许可证

[MIT](LICENSE) © 2026 MingZeng

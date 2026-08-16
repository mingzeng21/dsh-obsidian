# dsh-obsidian

把 [DeepSeek Harness](https://github.com/deepseek-ai/dsh)（`dsh`）连接到本地 [Obsidian](https://obsidian.md) vault。因为一个 Obsidian vault 本质上就是磁盘上的一堆 Markdown 文件，所以你的 `dsh` agent 可以直接搜索、读取、写入、移动和删除（移入回收站）笔记——**不需要 MCP server，也不需要 OAuth**。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Node: >=22.12.0](https://img.shields.io/badge/Node-%3E%3D22.12.0-339933.svg)](https://nodejs.org)

中文 | [English](README.en.md)

## 它能帮你做什么

装上 `dsh-obsidian` 后，你的 `dsh` agent 就能直接读写本地 Obsidian vault。插件会在启动时自动探测你的 vault（或读取你显式配置的路径），然后把 9 个 `obsidian_*` 工具挂载给 agent，覆盖搜索、读取、写入、追加、移动、删除和反链查询等日常操作。

## 特性

- **零依赖服务器** —— 直接读写 vault 文件系统，无需 Local REST API 社区插件，也无需常驻 MCP server。
- **可选 Obsidian 原生能力** —— 当 `obsidian` CLI 可用时，反链查询与移动会自动委托给它（移动时同步更新 `[[链接]]`）；否则全部回退到纯文件系统实现。
- **默认安全** —— 删除只把笔记移入 `.trash/`（可逆）、路径无法越出 vault 根目录、绝不触碰 `.obsidian/`。

## 工作原理

```text
dsh agent 调用 obsidian_* 工具
   │
   ▼
VaultAccess 接口
   ├─ FsAccess   —— node:fs + 自研 frontmatter/wikilink 解析（永远可用）
   └─ CliAccess  —— 检测到 obsidian CLI 时，反链/移动委托给它（其余走 fs）
```

启动时插件按「显式 `vaultPath` 优先，否则从 `obsidian.json` 自动探测」解析 vault 根目录；`useCli` 开启且检测到 CLI 时启用 `CliAccess`，任何 CLI 失败都会静默回退到 `FsAccess`。

## 安装

```sh
dsh plugin --profile web add dsh-obsidian
```

把 `web` 换成你运行 agent 所用的 profile（`web`、`headless`、`tui` 等）。

## 卸载

```sh
dsh plugin --profile web remove dsh-obsidian
```

## 配置

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `vaultPath` | （自动探测） | vault 的绝对路径；留空则按平台从 `obsidian.json` 自动探测当前打开的 vault |
| `useCli` | `true` | `obsidian` CLI 可用时，反链/移动委托给它 |
| `excludeDirs` | `[".obsidian", ".git", ".trash"]` | 搜索/列出时排除的目录 |

## 工具

| 工具 | 作用 |
| --- | --- |
| `obsidian_list` | 列出 vault 里的笔记（可按子目录过滤、限制条数） |
| `obsidian_search` | 全文检索，返回匹配行 + 上下文（大小写不敏感、只搜 `.md`） |
| `obsidian_read` | 读取一篇笔记（正文 + 解析后的 frontmatter） |
| `obsidian_frontmatter` | 只读笔记的 YAML 属性 |
| `obsidian_backlinks` | 找出链接到某篇笔记的笔记（`[[wikilink]]`） |
| `obsidian_write` | 新建或覆盖一篇笔记（父目录不存在时自动创建） |
| `obsidian_append` | 向笔记末尾追加内容 |
| `obsidian_move` | 移动/重命名笔记（CLI 可用时同步更新链接） |
| `obsidian_delete` | 把笔记移入 `.trash/`（可逆，绝不永久删除） |

所有工具的路径参数都相对于 vault 根目录（例如 `TradeArena/部署流程.md`）。

## 安全性

- **路径越界防护** —— 所有路径参数都会解析并校验必须落在 vault 根目录内，越界（`../` 或绝对路径逃逸）一律拒绝。
- **删除可逆** —— `obsidian_delete` 只把笔记移入 vault 的 `.trash/`，绝不永久删除。
- **不碰 `.obsidian/`** —— 搜索与列出默认排除 `.obsidian/`、`.git/`、`.trash/`。
- **保护 frontmatter 与 wikilink** —— 读取/写入不会破坏 YAML 属性和 `[[链接]]`（除非任务明确要求改）。

## 环境要求

- [DeepSeek Harness](https://github.com/deepseek-ai/dsh)（`dsh`）
- Node.js ≥ 22.12.0
- Obsidian CLI（可选，用于链接感知移动与 CLI 反链查询）

## 开发

```sh
npm install
npm run build      # tsdown → lib/
npm run typecheck  # tsc --noEmit
npm test           # vitest
```

## 许可证

[MIT](LICENSE) © 2026 MingZeng

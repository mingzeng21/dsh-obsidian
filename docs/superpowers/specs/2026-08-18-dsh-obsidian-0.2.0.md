# dsh-obsidian 0.2.0 设计文档

- 日期：2026-08-18
- 状态：已确认（待实现）
- 前置：`2026-08-16-dsh-obsidian-design.md`（0.1.0）

## 1. 背景与动机

0.1.0 发布后，经实测验证发现两处 CLI 集成是坏的：

- `obsidian backlinks path=X format=json` 返回 `[{ file }]`，代码假设的 `path/title/snippet` 字段不存在。
- `obsidian move path=X to=Y` 只改名、不更新 `[[链接]]`（受「自动更新链接」设置门控，默认关），代码却返回 `linksUpdated: true`。

官方 Obsidian CLI（1.12+）靠 IPC 跟运行中的 Obsidian 桌面应用通信，应用必须在运行；headless 需 xvfb hack（macOS 不可行）。因此 CLI 不能作为 headless `dsh` 的可靠路径。

**结论**：fs 是产品本体（零依赖、无需 Obsidian 运行）；CLI 回归「可选增强」，且从坏的 backlinks/move 重新指向其真正擅长的 `property:set`/`property:remove`。

## 2. 目标

让 `move` 可靠地更新 wikilink（不依赖 CLI/设置），新增 frontmatter 属性管理与 tag 列表两个高价值工具，并做一轮正确性加固 + 发布质量补强。

## 3. 架构变更（相对 0.1.0）

- **删除** `CliAccess` 对 `backlinks` / `move` 的覆盖（这两处纯 fs 更对）。
- **新增** `VaultAccess` 三个方法：`setProperty` / `deleteProperty` / `listTags`。
- `FsAccess`：全部纯 fs 实现（恒可用、headless 可跑）。
- `CliAccess`：仅覆盖 `setProperty` / `deleteProperty`（`property:set` / `property:remove`，已实证可用）；`listTags` 不覆盖（走 fs）。`useCli` 默认改为 `false`。

## 4. 新工具

| 工具 | 参数 | 返回 | 语义 |
|---|---|---|---|
| `obsidian_set_property` | `path`(必填), `key`(必填), `value`(必填, `json`) | frontmatter 解析结果 | 设置/更新单个 YAML 属性 |
| `obsidian_delete_property` | `path`(必填), `key`(必填) | frontmatter 解析结果 | 删除单个属性 |
| `obsidian_tags` | `dir?` | `[{ tag, count }]`（tag 带 `#` 前缀） | 列出 vault 所有 tag + 计数 |

## 5. 正确性加固

- `move` 纯 fs 重写 wikilink（`rewriteNoteLinks`），保留链接风格（basename/路径）与 `#`/`|alias` 后缀。
- `write` / `append` 原子写（临时文件 + rename）。
- `apply` 改为 async 并 `await setupAccess`（cordis 会 await `apply` 返回的 thenable），消除工具注册竞态。
- `delete` 撞名加计数器兜底。

## 6. 发布质量

- GitHub Actions：typecheck + test + build。
- `package.json` 补 `repository` / `homepage` / `bugs`。
- 清理根目录 `.tgz` 并确保 `.gitignore` 覆盖。

## 7. 明确延后（YAGNI）

- 附件读取（图片/PDF/canvas）。
- 多 vault 选择。
- backlinks 的 ripgrep 快路径（性能优化）。
- CLI 对 `listTags` 的覆盖（需再验证 `tags counts` 输出字段）。
- 类型化属性（`type=number|checkbox|date|...`）——纯 fs 暂只存字符串/JSON 值。

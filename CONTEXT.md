# dsh-obsidian Context

This project exposes a stable agent-facing interface over a local Obsidian vault. The terms below distinguish paths and search behavior at that interface from the operating system details used internally.

## Vault paths

**Vault root**:
The absolute filesystem directory that contains an Obsidian vault. It uses the host operating system's native path format, may be a Windows UNC directory, and is not an agent-facing relative path.

**Vault-relative path**:
A note or vault entry identified relative to the vault root. Its public representation always uses `/`, regardless of the host operating system; callers may provide either `/` or `\\` when passing a path.

**Agent-facing path**:
Any path accepted or returned by an `obsidian_*` tool or the `VaultAccess` interface. Relative agent-facing paths follow the vault-relative path contract.

**Vault-relative input boundary**:
Tool path arguments identify entries inside the vault relative to the vault root. Both `/` and `\\` are accepted as separators, while Unix absolute paths, Windows drive-letter paths, and UNC paths remain outside the tool path contract.

**Note identity**:
The path identity used to decide whether two vault entries refer to the same note. It follows the host filesystem's case rules: case-insensitive on Windows and case-sensitive on Unix-like systems.

**Markdown note**:
A vault note whose filename has a Markdown extension. Extension matching follows the host platform's filesystem semantics, including case-insensitive `.md` variants on Windows.

**Vault configuration**:
The Obsidian application configuration used to discover a vault when no explicit root is supplied. The platform-native configuration location is preferred, with other known locations used only as fallback.

## Search

**Search semantics**:
The user-visible meaning of `obsidian_search`: case-insensitive literal matching over Markdown notes, with stable paths, line numbers, context, ordering, limits, and exclusions.

**Search accelerator**:
An optional external program used to speed up search. Its presence, absence, and host operating system must not change search semantics.

**Search line**:
A line and its surrounding context returned by a search result. Line content excludes the line-ending characters, including the carriage return in CRLF input; Unicode content and paths are preserved.

**Command fallback**:
When an optional external command is missing or fails, including Windows `.exe` or `.cmd` resolution failures, the tool uses its built-in implementation or filesystem implementation instead of failing the core operation.

**Windows compatibility verification**:
Automated Windows CI and deterministic external-command stubs are the merge gate for platform behavior. A real Windows vault or Obsidian CLI smoke test is useful follow-up evidence but does not block the change.

**Windows compatibility build**:
A single coordinated change that keeps the agent-facing vault contract stable on Windows across paths, search, file operations, vault discovery, optional commands, documentation, and CI. It guarantees ordinary Node-supported paths and Unicode content, while leaving OS-specific permissions, locks, junctions, device names, and system path-length policy to the host.

# pi-ext-fan Footer (Powerline) 拆分研究报告

## 1. pi-ext-fan 完整路径

```
/Users/fliu56/vcc-repo/sparkwit/pi/extension/pi-ext-fan/
```

目录内容：仅一个文件 `index.ts`（812 行，31KB）。**无 package.json**，无 node_modules，无子目录。

## 2. package.json

**不存在。** pi-ext-fan 是单文件 extension，无 npm 依赖，pi 通过 jiti 直接加载 TypeScript。

如需拆分为独立 extension 且无外部 npm 依赖，可以不需要 package.json。若需要 npm 依赖，则需创建：

```json
{
  "name": "pi-ext-powerline",
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

## 3. 项目结构总览

pi-ext-fan 是一个 **5 功能合一** 的 extension pack，通过 `/ext` 命令切换各功能：

| # | 功能名 | 行范围 | 说明 |
|---|--------|--------|------|
| 1 | at-agent | L77-133 | @agent 语法拦截 + 自动补全 |
| 2 | clean-status | L139-146 | 清理僵尸 status |
| 3 | last-request | L152-189 | 编辑器下方显示最后用户消息 |
| 4 | sidebar | L197-529 | 右侧 TUI overlay（Todos/Sub-agents/LSP/MCP）|
| **5** | **powerline** | **L531-686** | **Powerline 风格 footer（拆分目标）** |

另有 `/ext` 命令（L692-760）和 `/think` 命令（L770-798）。

## 4. Footer (Powerline) 完整源代码

### 4.1 模块级状态（L536-537）

```typescript
let footerDispose: (() => void) | null = null;
let currentThinkingLevel: string = "off";
```

### 4.2 registerPowerline（L538-543）

```typescript
function registerPowerline(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    if (!state.powerline) return;
    startPowerline(ctx, pi);
  });
}
```

### 4.3 startPowerline（L545-681）— 核心

```typescript
function startPowerline(ctx: ExtensionContext, pi: ExtensionAPI): void {
  if (ctx.mode !== "tui") return;

  // Get initial thinking level
  currentThinkingLevel = pi.getThinkingLevel();

  // Subscribe to thinking level changes
  pi.on("thinking_level_select", (event) => {
    currentThinkingLevel = event.level;
  });

  ctx.ui.setFooter((tui, _theme, footerData) => {
    const unsub = footerData.onBranchChange(() => tui.requestRender());
    footerDispose = unsub;

    const ARROW_RIGHT = "\uE0B0";
    const BOLD = "\x1b[1m";
    const RESET = "\x1b[0m";
    const WHITE = fg("#FFFFFF");

    interface Segment { label: string; bgHex: string; }

    function bg(hex: string): string {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `\x1b[48;2;${r};${g};${b}m`;
    }
    function fg(hex: string): string {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `\x1b[38;2;${r};${g};${b}m`;
    }
    function fmtNum(n: number): string {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
      return `${n}`;
    }
    function buildSegments(segs: Segment[]): string {
      if (!segs.length) return "";
      let out = "";
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]!;
        out += `${bg(s.bgHex)}${BOLD}${WHITE} ${s.label} `;
        if (i + 1 < segs.length) {
          out += `${bg(segs[i + 1]!.bgHex)}${fg(s.bgHex)}` + ARROW_RIGHT;
        } else {
          out += RESET;
          out += fg(s.bgHex) + ARROW_RIGHT;
        }
      }
      return out;
    }
    function getStats() {
      let input = 0, output = 0, msgCount = 0, toolCallCount = 0;
      for (const e of ctx.sessionManager.getBranch()) {
        if (e.type === "message") {
          msgCount++;
          if (e.message.role === "assistant") {
            const m = e.message as AssistantMessage;
            input += m.usage?.input ?? 0;
            output += m.usage?.output ?? 0;
            for (const c of m.content ?? []) {
              if ((c as any).type === "toolCall") toolCallCount++;
            }
          }
        }
      }
      return { input, output, msgCount, toolCallCount };
    }

    // Live clock: re-render every second
    const clockTimer = setInterval(() => tui.requestRender(), 1000);

    return {
      dispose() {
        unsub();
        clearInterval(clockTimer);
      },
      invalidate() { },
      render(width: number): string[] {
        const branch = footerData.getGitBranch();
        const provider = ctx.model?.provider || "";
        const model = ctx.model?.id
          ? ctx.model.id.split("/").pop()!.slice(0, 24)
          : "no-model";
        const context = ctx.getContextUsage();

        let contextStr = "";
        if (context && context.percent !== null) {
          const pct = context.percent.toFixed(1);
          contextStr = `${fmtNum(context.tokens!)}/${fmtNum(context.contextWindow)}(${pct}%)`;
        } else if (context) {
          contextStr = `?/${fmtNum(context.contextWindow)}`;
        } else {
          contextStr = "no-model";
        }

        let contextBg = "#4CAF50";
        if (context && context.percent !== null) {
          if (context.percent >= 90) contextBg = "#F44336";
          else if (context.percent >= 70) contextBg = "#FF9800";
          else if (context.percent >= 50) contextBg = "#FFC107";
        }

        const stats = getStats();
        const cwd = ctx.cwd.split("/").pop() || ctx.cwd;
        const segs: Segment[] = [
          { label: `📁 ${cwd}`, bgHex: "#1B5E20" },
        ];
        if (branch) {
          segs.push({ label: `⎇ ${branch}`, bgHex: "#00838F" });
        }
        if (provider) {
          segs.push({ label: `☁️ ${provider}`, bgHex: "#6A1B9A" });
        }
        segs.push({ label: `🤖 ${model} (${currentThinkingLevel})`, bgHex: "#5C6BC0" });
        segs.push({ label: `🧠 ${contextStr}`, bgHex: contextBg });
        segs.push({ label: `💬 ${stats.msgCount} msgs`, bgHex: "#7B1FA2" });
        segs.push({ label: `🔧 ${stats.toolCallCount} tools`, bgHex: "#E64A19" });

        const leftStr = buildSegments(segs);
        const leftWidth = visibleWidth(leftStr);

        // Clock: right-aligned, plain text, no background
        const now = new Date();
        const clockStr = now.toLocaleTimeString('en-GB', { hour12: false });
        const clockWidth = visibleWidth(clockStr);
        const pad = Math.max(1, width - leftWidth - clockWidth);

        return [truncateToWidth(leftStr + " ".repeat(pad) + clockStr, width)];
      },
    };
  });
}
```

### 4.4 stopPowerline（L683-686）

```typescript
function stopPowerline(): void {
  if (footerDispose) { footerDispose(); footerDispose = null; }
  footerDispose = null;
}
```

## 5. Footer 对 pi-ext-fan 内部模块的依赖清单

### 5.1 直接依赖（必须处理）

| 依赖项 | 来源 | 拆分处理方式 |
|--------|------|-------------|
| `state.powerline` | FeatureState 接口 (L33-48) | **解耦**：改为独立 boolean 变量，默认 `true` |
| `footerDispose` | 模块级变量 (L536) | **直接复制**：powerline 自有状态 |
| `currentThinkingLevel` | 模块级变量 (L537) | **直接复制**：powerline 自有状态 |

### 5.2 间接依赖（通过 /ext 命令）

| 依赖项 | 说明 | 拆分处理方式 |
|--------|------|-------------|
| `FEATURE_NAMES["powerline"]` | /ext 命令查找表 | **不需要**：独立 extension 无需 /ext |
| `FEATURE_LABELS.powerline` | /ext 命令显示标签 | **不需要** |
| /ext 命令中 powerline 的 on/off | 只设 state，不调用 start/stop | **注意**：当前 /ext 切换 powerline 不会动态启停 footer，仅影响下次 session_start |

### 5.3 无依赖（powerline 完全不使用）

- TodoTask / replayTodos / syncTodos（sidebar 专用）
- AgentInfo / onAgentStart / onAgentEnd（sidebar 专用）
- LspEntry / scanLsp（sidebar 专用）
- McpEntry / scanMcp（sidebar 专用）
- SidebarComponent 类（sidebar 专用）
- registerSidebar / startSidebar / stopSidebar
- registerAtAgent / getBuiltinAgentNames
- registerCleanStatus
- registerLastRequest
- registerThinkCommand（/think 命令，独立功能）

## 6. Footer 使用的外部依赖清单

**无外部 npm 依赖。** 所有导入均来自 pi SDK 包和 Node.js 内置模块。

| 包 | 导入内容 | 用途 |
|----|---------|------|
| `@earendil-works/pi-coding-agent` | `ExtensionAPI` (type), `ExtensionContext` (type) | 类型定义 |
| `@earendil-works/pi-ai` | `AssistantMessage` (type) | getStats() 中读取 usage |
| `@earendil-works/pi-tui` | `truncateToWidth`, `visibleWidth` | 文本宽度计算和截断 |
| `node:fs` | 未使用 | powerline 不需要 |
| `node:path` | 未使用 | powerline 不需要 |
| `node:os` | 未使用 | powerline 不需要 |

## 7. Footer 使用的 Pi SDK API 清单

### 7.1 核心 Footer API

| API | 调用位置 | 说明 |
|-----|---------|------|
| `ctx.ui.setFooter(factory)` | startPowerline L553 | 注册自定义 footer，替换内置 footer |
| `ctx.ui.setFooter(undefined)` | 未在 powerline 中调用 | 恢复内置 footer（stopPowerline 只调 dispose） |
| `footerData.getGitBranch()` | render() L636 | 获取当前 git 分支名 |
| `footerData.onBranchChange(cb)` | startPowerline L554 | 分支变化时触发重渲染 |
| `footerData.getExtensionStatuses()` | 未使用 | 可获取 setStatus 的状态（powerline 未用） |

### 7.2 上下文信息 API

| API | 调用位置 | 说明 |
|-----|---------|------|
| `ctx.model?.provider` | render() L637 | 当前模型提供商 |
| `ctx.model?.id` | render() L638 | 当前模型 ID |
| `ctx.getContextUsage()` | render() L641 | 上下文窗口使用情况（tokens, percent, contextWindow） |
| `ctx.sessionManager.getBranch()` | getStats() L601 | 遍历会话条目统计消息/工具调用数 |
| `ctx.cwd` | render() L656 | 当前工作目录 |

### 7.3 生命周期 / 事件 API

| API | 调用位置 | 说明 |
|-----|---------|------|
| `pi.on("session_start")` | registerPowerline L539 | 会话启动时初始化 footer |
| `pi.on("thinking_level_select")` | startPowerline L549 | 订阅 thinking level 变化 |
| `pi.getThinkingLevel()` | startPowerline L546 | 获取初始 thinking level |
| `tui.requestRender()` | clockTimer L618, onBranchChange L554 | 强制 TUI 重渲染 |

### 7.4 TUI 工具函数

| API | 来源 | 用途 |
|-----|------|------|
| `truncateToWidth(str, width)` | `@earendil-works/pi-tui` | 按可见宽度截断字符串 |
| `visibleWidth(str)` | `@earendil-works/pi-tui` | 计算字符串可见宽度（排除 ANSI 转义） |

## 8. Pi Extension 标准结构要求（从文档提取）

### 8.1 入口

- 默认导出 `function(pi: ExtensionAPI)` 或 `async function(pi: ExtensionAPI)`
- 单文件：`~/.pi/agent/extensions/my-ext.ts`
- 目录：`~/.pi/agent/extensions/my-ext/index.ts`
- 带依赖：`package.json` 中 `"pi": { "extensions": ["./src/index.ts"] }`

### 8.2 加载机制

- 通过 jiti 加载，TypeScript 无需编译
- 自动发现位置：`~/.pi/agent/extensions/`（全局）、`.pi/extensions/`（项目级）
- 可通过 `settings.json` 的 `extensions` 字段添加额外路径

### 8.3 可用导入

| 包 | 用途 |
|----|------|
| `@earendil-works/pi-coding-agent` | ExtensionAPI, ExtensionContext, 事件类型 |
| `typebox` | 工具参数 schema |
| `@earendil-works/pi-ai` | AI 工具（StringEnum 等） |
| `@earendil-works/pi-tui` | TUI 组件（Text, Box, Component 等） |
| Node.js 内置模块 | `node:fs`, `node:path` 等 |

### 8.4 Footer API 签名（来自 tui.md Pattern 6）

```typescript
ctx.ui.setFooter((tui, theme, footerData) => ({
  invalidate() {},
  render(width: number): string[] {
    // footerData.getGitBranch(): string | null
    // footerData.getExtensionStatuses(): ReadonlyMap<string, string>
    return [`${ctx.model?.id} (${footerData.getGitBranch() || "no git"})`];
  },
  dispose: footerData.onBranchChange(() => tui.requestRender()), // reactive
}));

ctx.ui.setFooter(undefined); // restore default
```

### 8.5 注意事项

- `ctx.mode === "tui"` 检查：footer 仅在 TUI 模式下有效
- `setFooter` 替换整个内置 footer，不是追加
- `dispose` 用于清理订阅（如 onBranchChange）
- 每秒 `tui.requestRender()` 实现时钟（注意性能）

## 9. 拆分建议

### 9.1 独立 extension 所需文件

**最小方案（推荐）：单文件，无 package.json**

```
~/.pi/agent/extensions/pi-powerline-footer.ts    # 或放入子目录
```

仅需一个 TypeScript 文件，约 160 行（从 812 行中精简）。

**目录方案（如需后续扩展）：**

```
~/.pi/agent/extensions/pi-powerline-footer/
├── index.ts          # 入口 + powerline 逻辑
└── package.json      # 可选，仅当需要 npm 依赖时
```

### 9.2 需要从 pi-ext-fan 提取的代码

| 代码块 | 行范围 | 处理 |
|--------|--------|------|
| `footerDispose` 变量 | L536 | 直接复制 |
| `currentThinkingLevel` 变量 | L537 | 直接复制 |
| `registerPowerline()` | L538-543 | 复制，移除 `state.powerline` 检查 |
| `startPowerline()` | L545-681 | 完整复制（核心，约 137 行） |
| `stopPowerline()` | L683-686 | 直接复制 |

### 9.3 需要解耦的部分

| 原始依赖 | 解耦方式 |
|----------|---------|
| `state.powerline` (FeatureState) | 改为模块级 `let enabled = true`，或直接移除（始终启用） |
| `/ext` 命令中的 powerline 切换 | 可选：注册独立 `/powerline` 命令做 toggle |
| `pi.on("thinking_level_select")` 在 startPowerline 内注册 | **注意**：每次 session_start 都会重复注册。建议移到工厂函数顶层只注册一次 |

### 9.4 独立 extension 的 import 清单

```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
```

不需要 `node:fs`、`node:path`、`node:os`（powerline 不使用文件系统）。

### 9.5 潜在问题和改进建议

1. **thinking_level_select 重复注册**：当前 `startPowerline` 在每次 `session_start` 时调用 `pi.on("thinking_level_select")`，会导致多次注册。独立 extension 应在工厂函数中只注册一次。

2. **stopPowerline 未调用 setFooter(undefined)**：当前 `stopPowerline` 只调用 `footerDispose()`（即 onBranchChange 的 unsubscribe），但不调用 `ctx.ui.setFooter(undefined)` 恢复内置 footer。如果需要完全恢复，应补充。

3. **每秒重渲染**：`setInterval(() => tui.requestRender(), 1000)` 用于时钟显示。如果不需要时钟，可移除以节省性能。

4. **getStats() 每次 render 都遍历整个 branch**：对于长会话可能有性能影响。可考虑缓存 + 事件驱动更新。

5. **Powerline 箭头字符 `\uE0B0`**：需要终端安装 Powerline/Nerd Font 字体才能正确显示。

### 9.6 独立 extension 模板

```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

let footerDispose: (() => void) | null = null;
let currentThinkingLevel: string = "off";

export default function (pi: ExtensionAPI): void {
  // 只注册一次 thinking level 监听
  pi.on("thinking_level_select", (event) => {
    currentThinkingLevel = event.level;
  });

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    currentThinkingLevel = pi.getThinkingLevel();
    startPowerline(ctx);
  });

  // 可选：/powerline 命令 toggle
  pi.registerCommand("powerline", {
    description: "Toggle powerline footer",
    handler: async (_args, ctx) => {
      // toggle logic
    },
  });
}

function startPowerline(ctx: ExtensionContext): void {
  // ... 从 pi-ext-fan L545-681 复制
}
```

### 9.7 与 pi-ext-fan 的共存

- 如果独立 extension 和 pi-ext-fan 同时加载，两者都会调用 `ctx.ui.setFooter()`，**后加载的会覆盖先加载的**
- 建议：拆分后在 pi-ext-fan 中禁用 powerline 功能（`state.powerline = false`），或从 pi-ext-fan 中移除 powerline 代码
- 或者在 pi-ext-fan 的 DEFAULT_STATE 中将 `powerline` 设为 `false`

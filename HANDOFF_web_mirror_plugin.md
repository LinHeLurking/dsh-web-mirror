# 移交文档：`web-mirror` 通用只读镜像插件

> **读者**：接手开发 `web-mirror` 的 agent（或人）。本文自包含，不依赖任何外部对话上下文；读完即可开工。
>
> **委托方请求**：开发一个与具体业务**完全解耦**的 DSH（DeepSeek Harness）通用插件 `web-mirror`。它把"可镜像数据源"的内容以**只读、无鉴权、实时**的方式，经**独立端口**暴露成网页。它不知道也不关心数据源是 ATEAM 的房间、还是别的任何插件的数据。
>
> **归属定案**：独立仓 / 通用插件，独立开发、独立发布。不在 ateam-core 仓内开发；ateam-core 只作为它的**第一个数据源实现者**消费它。

---

## 1. 要做什么（一句话）

写一个 DSH 插件 `web-mirror`：通过 Cordis 的 `inject` 拿到一个"可镜像数据源"服务，然后在**独立端口**起一个**无鉴权、全 GET、无写路径**的 HTTP server，把数据源的 topic 列表 / 历史快照 / 实时事件流，以 HTML 页 + SSE 实时推送的方式只读暴露出去。

**非目标**：不做鉴权、不做任何写操作（无发消息、无回答、无回写数据源）、不做业务概念（房间/run/审批这些术语属于数据源，不属于 web-mirror）。

---

## 2. 背景与定位

委托方（ATEAM）正在把它的多 agent 协作系统迁入 DSH 宿主。DSH 原生的 web 面板在 `/api` 下、cookie 鉴权，供操作者使用。ATEAM 额外想要一个**公开的只读镜像**：把协作空间（"房间"）的消息时间线展示给任何拿到链接的人看，这些人**只能看、不能操作**。

关键架构判断：**这个只读镜像不该和 ATEAM 耦合**。它本质是一个通用能力——"把某个插件的数据通道内容只读镜像出去"。因此它被设计为一个独立的通用插件 `web-mirror`：

- `web-mirror` 定义并消费一个**与业务无关的数据源契约**（下文 §3）。
- 任何插件（ATEAM 的 `RoomService` 是第一个）只要 `ctx.provide` 一个实现该契约的服务，就能被 `web-mirror` 镜像。
- `web-mirror` 因而可独立开发、独立测试（用一个 fake 数据源）、独立发布，不依赖 ATEAM。

---

## 3. 核心契约：`MirrorSource`（解耦的关键）

`web-mirror` 与数据源之间通过 **Cordis 的 provide/inject 服务发现**解耦：

- 数据源插件：`ctx.provide('mirror-source', sourceImpl)`。
- `web-mirror`：`export const inject = ['mirror-source']`（或对应机制），拿到 `sourceImpl` 使用。

契约形状（TypeScript 接口，供双方对齐；字段可按实现期需要微调，但 topic/snapshot/subscribe 三件套是骨架）：

```ts
/** 一个可被镜像的事件/消息 */
interface MirrorEvent {
  /** 单调递增序号（topic 内），用于排序与断线重续 */
  seq: number
  /** 事件时间（ISO 8601 或 RFC3339） */
  time: string
  /** 事件分类（如 message / system / card），渲染层据此分类展示 */
  kind: string
  /** 作者标识（人 / bot / 系统），渲染层展示 */
  author: string
  /** 语义载荷，形状由数据源自定；web-mirror 通用渲染器按 kind 给默认呈现 */
  body: unknown
}

/** 一个可镜像的 topic（逻辑频道；ATEAM 的"房间"是 topic 的一种） */
interface MirrorTopic {
  id: string
  title: string
  meta?: unknown
}

/** 可镜像数据源服务 */
interface MirrorSource {
  /** 列出当前全部 topic */
  listTopics(): Promise<MirrorTopic[]> | MirrorTopic[]
  /** 拉取某 topic 的历史快照（fold 到当前，一次性） */
  snapshot(topicId: string): Promise<MirrorEvent[]> | MirrorEvent[]
  /** 订阅某 topic 的实时事件流（新事件持续产出，含断线重续语义由实现定） */
  subscribe(topicId: string): AsyncIterable<MirrorEvent>
}
```

**设计约束**：

- `web-mirror` 只面对这个接口编程，**不认识** ATEAM 的 room / run / pending_wait / session 等概念。渲染层按 `MirrorEvent.kind` 给通用默认呈现；数据源可在 `body` 里携带更丰富的载荷供专门呈现。
- 一个进程里可能有多个 `mirror-source` 提供者；`web-mirror` 应能聚合（或至少挑一个，实现期定——初版支持单源即可，多源聚合留作增强）。

---

## 4. 部署形态：独立端口（已定案）

镜像页**不复用** DSH 主 web server（`/api` + cookie 鉴权所在的那个）。`web-mirror` 插件自己 `import { createServer } from 'node:http'`，`server.listen(镜像端口)`，与主 server 完全分离：

- **两个网络入口、零共享**：主 server（鉴权面）与镜像 server（无鉴权只读）各自独立监听、独立路由、独立连接池。镜像面根本不经过 `/api` 的 `requestRejection` / `authorizeIndex` 路径。
- **独立暴露策略**：可以只把镜像端口暴露给公网/观众，主 `/api` 端口保持内网或加防火墙——网络层把"能操作的人"和"只能看的人"分开，不靠应用层鉴权兜底。
- **故障与安全隔离**：镜像面的 bug 或被扫描不波及主 server 的鉴权面。
- **生命周期**：用 `ctx.effect(cleanup)` 管理 listener（热载 dispose 时关闭重开）。镜像端口做成插件配置项（cordis config schema），不写死。

---

## 5. HTTP 端点（全部 GET，无写路径）

| 端点 | 行为 | 数据来源 |
|---|---|---|
| `GET /` | serve 镜像页 HTML（极简静态壳，内联或挂静态资源） | — |
| `GET /topics` | 返回 topic 列表 JSON | `source.listTopics()` |
| `GET /topics/:id/history` | 返回该 topic 历史快照 JSON（`MirrorEvent[]`） | `source.snapshot(id)` |
| `GET /topics/:id/events` | **SSE 事件流**（`content-type: text/event-stream`），把 `source.subscribe(id)` 的事件逐条推给浏览器 | `source.subscribe(id)` |

**只读是机制性强制的，不是 UI 隐藏**：镜像 server **只注册 GET 端点**，不存在任何写路径（没有 POST/PUT/DELETE，没有发消息端点、没有回答卡片端点、没有回写数据源的通道）。从网络层面就保证"无法操作和对话"。

**前端**：一个独立极简静态页（不依赖 cookie、不调 `/api`），用浏览器原生 `EventSource` 订阅 `events` 端点实时追加，初次加载先 `history` 拉快照再补实时。按 `MirrorEvent.kind` 分类渲染 + `author` + `time`。

---

## 6. 关键技术事实（DSH 源码已核实，file:line）

开发这些时直接参考，不必重新调研：

- **`ctx.effect` 管理 listener 生命周期**：DSH 自己的 webserver 就是这么做的（dispose 时关连接、销毁 upgraded sockets）。模式照抄即可：`packages/host/webserver/src/index.ts:304`。
- **插件可 import `node:http` 自建 listener**：插件是普通 TS 模块，`createServer` + `listen` 可用。
- **SSE 实时推送先例**：`text/event-stream` 响应 + 前端 `EventSource`。服务端写 SSE 帧：`packages/client/hmr/src/index.ts:163`；前端订阅：`packages/client/hmr/src/client/index.ts:166`。
- **插件间服务发现（provide/inject）**：`ctx.provide(key, service)` 暴露、消费方 `inject = [key]`。先例：`packages/storage/storage-json/src/index.ts:20`（`inject=['storage']`）、`:118`（`ctx.provide(storageBackendServiceKey('json'), backend)`）。
- **自定义无鉴权路由先例**：DSH 的鉴权是各路由 handler 自己调的，插件自定义路由不调用即无鉴权。先例：`packages/webhook/webhook-github/src/index.ts:50-59`（自定义 exact 路由，handler 自决鉴权）。

> 注意：以上 file:line 基于委托方开发时核对的 DSH checkout（`/data/workspace/deepseek-harness`）。DSH 处于 dev-preview，签名可能漂移；开工前先 pin 一个可用版本，并对照核实这些行号是否仍准确。

---

## 7. 测试策略

- **fake 数据源**：写一个内存 fake `MirrorSource`（几个固定 topic、持续间隔产出事件），`web-mirror` + fake 即可独立跑通全流程，不依赖 ATEAM。
- **验证点**：
  1. 不带任何凭据打开镜像端口 `/` → 看到 topic 列表；
  2. 进某 topic → `history` 快照渲染正确；
  3. fake 源持续产事件 → 镜像页经 SSE 实时追加（两个浏览器同时开都收到）；
  4. 全端点只有 GET——尝试 `POST` 任一已知路径应 404/405；
  5. 热载（改插件代码触发 Cordis HMR）→ listener 正确 dispose + 重启、SSE 客户端自动重连。

---

## 8. 验收标准

1. 独立端口 listener 起停、热载正常（`ctx.effect` 管理）。
2. 无鉴权：无 cookie / 无 token 即可读全部镜像内容。
3. 只读：无任何写路径，无法经镜像面发起任何操作。
4. 实时：`subscribe` 事件经 SSE 到达浏览器。
5. 解耦：不 import 任何 ATEAM 模块、不出现 room/run 等业务词；用 fake 数据源可独立运行、与 ATEAM 数据源可互换。
6. 多源（可选增强）：能聚合多个 `mirror-source` 提供者。

---

## 9. 与 ATEAM 的接合（委托方侧，非本插件职责）

ATEAM 的 `RoomService` 会 `ctx.provide('mirror-source', roomAdapter)`，其中 `roomAdapter` 把房间（topic）与房间时间线行（`MirrorEvent`）适配到 §3 契约。**该适配器归 ATEAM 侧开发，不属于 `web-mirror`。** 本插件只需保证：任何满足 §3 契约的数据源都能被正确镜像。

ATEAM 侧的定案（供你理解，不影响你的实现）：范围 = 全部房间；实时推送；内容深度 = 只到房间时间线（不含 run session 内部轨迹——那是数据源自己决定不放进 `mirror-source` 的）。

---

## 10. 明确不做（YAGNI 边界）

- 不做鉴权 / 访问控制（如未来要"半公开"，加 token 是另一条事，不在本版）。
- 不做任何写操作或回写数据源。
- 不做业务概念渲染的特化（通用渲染即可；业务特化由数据源自营或后续增强）。
- 不做多源聚合的完整版（初版单源可跑即可，多源留增强）。
- 不交付给 ATEAM 的房间 UI 组件——那是 ATEAM 的事；`web-mirror` 给通用行渲染。

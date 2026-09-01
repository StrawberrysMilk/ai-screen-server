# LangGraph.js Agent Server 学习笔记

> 本笔记根据当前 `apps/agent-server` 的实现整理，目标是理解一个最小可运行的 LangGraph.js 对话 Agent 如何定义状态、调用模型、编译图并交给 LangGraph Server 运行。

## 1. 项目定位

这是一个基于 **LangGraph.js** 的最小对话 Agent 服务。当前实现只有一个处理节点：接收消息历史，调用 OpenAI 兼容的聊天模型，并把模型返回的消息追加回状态。

项目入口由 `langgraph.json` 声明：

```json
{
  "graphs": {
    "agent": "./src/agent/index.ts:graph"
  }
}
```

这表示 LangGraph CLI 会从 `src/agent/index.ts` 中读取导出的 `graph` 对象，并将其作为名为 `agent` 的图提供服务。

## 2. 目录与职责

```text
apps/agent-server/
├─ src/
│  ├─ agent/
│  │  ├─ state.ts       # 图状态定义
│  │  └─ index.ts        # 节点、边和图的编排
│  └─ ai/
│     └─ model.ts        # 聊天模型工厂
├─ langgraph.json        # LangGraph Server 配置
├─ scripts/
│  └─ checkLanggraphPaths.js  # 检查图路径和导出对象
└─ package.json          # 开发、构建、测试和校验命令
```

可以把代码分成三层：

1. **状态层**：定义节点之间传递的数据结构。
2. **模型层**：集中创建和配置 LLM 客户端。
3. **编排层**：定义节点、执行顺序和图的出口。

## 3. 状态模型：`MessagesValue`

`src/agent/state.ts` 使用 LangGraph 的 `StateSchema`：

```ts
import { MessagesValue, StateSchema } from '@langchain/langgraph'

export const State = new StateSchema({
  messages: MessagesValue,
})
```

### 关键理解

- `StateSchema` 描述整个图运行时可见的状态。
- `messages` 是对话消息列表，通常包含用户消息、系统消息和模型消息。
- `MessagesValue` 不只是普通数组，它会按 LangGraph 的消息规则处理消息更新。
- 节点不需要返回完整状态，只需返回要更新的字段。例如本项目节点只返回 `{ messages: [result] }`，框架会将新消息合并到已有历史中。

### 为什么要把状态单独定义

状态是图中各节点之间的契约。将它单独放在 `state.ts`，可以让后续新增工具调用、检索结果、用户偏好等字段时，保持数据结构集中且容易检查。

## 4. 图编排：节点、边与执行流程

`src/agent/index.ts` 的核心逻辑如下：

```ts
const handleMessageTask = async state => {
  const model = createChatModel()
  const result = await model.invoke(state.messages)
  return { messages: [result] }
}

const builder = new StateGraph(State)
  .addNode('handleMessageTask', handleMessageTask)
  .addEdge(START, 'handleMessageTask')
  .addEdge('handleMessageTask', END)

export const graph = builder.compile()
graph.name = 'ScreenDesignAgent'
```

### 执行时序

```text
输入消息
   │
   ▼
START ──► handleMessageTask ──► END
             │
             ├─ 创建聊天模型
             ├─ 用完整消息历史调用模型
             └─ 返回一条新的模型消息
```

### API 说明

- `START`：图的开始节点。
- `END`：图的结束节点。
- `addNode(name, handler)`：注册一个节点和它的处理函数。
- `addEdge(from, to)`：定义固定执行路径。
- `compile()`：将构建器编译成可执行图。
- `graph.name`：为图设置便于调试和识别的名称。

当前图是线性流程，适合入门。更复杂的 Agent 通常会增加条件边，例如“模型要求调用工具”时转向工具节点，否则直接结束。

## 5. 模型配置：OpenAI Responses API

`src/ai/model.ts` 通过 `ChatOpenAI` 创建模型：

```ts
export function createChatModel() {
  return new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL,
    useResponsesApi: true,
    modelKwargs: {
      store: false,
    },
  })
}
```

### 配置要点

- `OPENAI_CHAT_MODEL` 从环境变量读取模型名，避免把模型选择硬编码在业务节点中。
- `useResponsesApi: true` 表示使用 OpenAI Responses API 适配方式。
- `store: false` 表示不要求 API 持久化本次请求，适合不希望额外保存请求数据的场景。
- API 密钥等敏感信息应放在本地 `.env`，不要提交到 Git。`.env.example` 只用于说明需要哪些变量。

### 可改进点

生产环境建议为模型名设置启动校验，并显式配置超时、重试、温度等参数；同时对模型调用错误做统一处理，避免单次 API 失败直接终止整个图。

## 6. 本地运行

在仓库根目录安装依赖后，可以使用 workspace 脚本：

```bash
pnpm install
pnpm dev:agent
```

也可以进入当前应用目录运行：

```bash
cd apps/agent-server
pnpm dev
```

启动前需要准备环境变量：

```bash
cp .env.example .env
```

然后在 `.env` 中配置实际使用的模型和 API 凭据。LangGraph CLI 会读取 `langgraph.json` 中的 `env` 配置并加载 `.env`。

## 7. 常用开发命令

```bash
pnpm build                 # TypeScript 编译
pnpm lint                  # ESLint 检查 src
pnpm format                # 自动格式化
pnpm format:check          # 检查格式但不修改文件
pnpm lint:langgraph-json   # 检查 langgraph.json 中的图路径和导出
pnpm test                  # 单元测试
pnpm test:int              # 集成测试
```

其中 `lint:langgraph-json` 会确认：

1. `langgraph.json` 存在且 JSON 格式正确。
2. `graphs` 字段存在且为对象。
3. 每个图指向的文件真实存在。
4. 文件确实导出了配置中声明的对象名。

## 8. 当前实现的边界

当前项目是“单节点聊天”示例，并未实现以下能力：

- 工具调用和外部系统操作。
- 条件路由或多轮 Agent 循环。
- 数据库检查点和跨会话持久化策略。
- RAG、文档检索和引用来源。
- 输入校验、鉴权、限流和结构化日志。
- 针对模型 API 错误、超时和空响应的业务兜底。

因此，当前代码适合学习 LangGraph 的基本结构，不应直接视为完整生产方案。

## 9. 推荐练习路线

### 练习一：增加系统提示词

在调用模型前加入一条系统消息，固定 Agent 的角色、输出格式和语言。

### 练习二：拆分模型节点

将“意图识别”和“回答生成”拆成两个节点，并用边连接，观察状态如何在节点间流转。

### 练习三：增加条件边

让模型先判断是否需要工具：需要时进入工具节点，不需要时直接结束。

### 练习四：加入工具调用

为 Agent 增加天气查询、数据库查询或屏幕数据读取工具，并记录工具输入输出。

### 练习五：补充测试

为状态更新、图路径校验和模型调用失败场景增加测试；模型本身可使用 mock，避免测试依赖真实 API。

## 10. 一句话总结

这个项目展示了 LangGraph.js 的最小闭环：**用 `StateSchema` 定义消息状态，用节点函数执行业务逻辑，用边描述流程，最后编译成可被 LangGraph Server 加载的图**。

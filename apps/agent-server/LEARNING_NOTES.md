# LangGraph.js Agent Server 学习笔记

> 本笔记按项目演进过程持续整理。第 1～10 节记录最小单节点 Agent 阶段，第 11 节开始记录意图分类、条件路由和编辑器上下文接入。

## 1. 项目定位

这是一个基于 **LangGraph.js** 的 AI 大屏设计 Agent 服务。项目最初只有一个对话节点，当前已经演进为“意图分类 + 分类任务处理”的多分支流程。

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

以上是项目第一阶段的线性流程。当前实现已经增加条件边，详细内容见第 11 节。

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

在第一阶段，项目还是“单节点聊天”示例，并未实现以下能力：

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

第一阶段展示了 LangGraph.js 的最小闭环：**用 `StateSchema` 定义消息状态，用节点函数执行业务逻辑，用边描述流程，最后编译成可被 LangGraph Server 加载的图**。

---

## 11. 第二阶段：从单节点升级为意图路由

当前图不再直接回答所有请求，而是先判断用户意图，再把任务交给对应节点：

```text
                         ┌─ message ─► handleMessageTask ─┐
输入 ─► START ─► classifyTask ├─ edit ───► handleEditTask ───┼─► END
                         └─ page ───► handlePageTask ────┘
```

三种任务的含义如下：

| 分类      | 含义                   | 当前处理方式                   |
| --------- | ---------------------- | ------------------------------ |
| `message` | 普通问答、查询页面事实 | 调用模型并提供完整编辑器上下文 |
| `edit`    | 修改当前页面           | 暂时返回固定的任务确认消息     |
| `page`    | 创建完整页面或大屏     | 暂时返回固定的任务确认消息     |

这是一种典型的“路由器 + 专用节点”设计。分类节点只负责判断任务类型，具体任务由下游节点完成，各节点的职责比把所有提示词和逻辑堆在一个节点中更清晰。

## 12. 使用 Zod 定义分类结果

`src/agent/classification.ts` 使用 Zod 限制模型输出：

```ts
export const ClassificationSchema = z.object({
  task: z
    .enum(['message', 'page', 'edit'])
    .describe(
      '识别用户意图的任务分类，message = 普通问答，page = 创建页面，edit = 修改页面'
    ),
})
```

这里的重点是：不要依赖模型自由生成一段文本后再手动解析，而是直接要求模型返回符合 Schema 的结构化数据。

```ts
const model = chatModel.withStructuredOutput(ClassificationSchema, {
  name: 'task_classification',
  method: 'jsonSchema',
})
```

`withStructuredOutput` 的作用包括：

- 将期望的字段和枚举值告诉模型。
- 将模型响应解析为 JavaScript 对象。
- 根据 Zod Schema 校验结果，减少非法分类进入路由器的概率。
- 让 `response.task` 的业务含义比解析自然语言更稳定。

## 13. 分类节点的完整过程

`classifyTask` 的处理过程可以拆成五步：

1. 创建专用于分类的模型实例。
2. 使用 `withStructuredOutput` 约束响应格式。
3. 从消息历史中找到最后一条用户消息。
4. 结合系统分类规则调用模型。
5. 将分类写入图状态的 `classification` 字段。

```ts
return {
  classification: {
    task,
  },
}
```

分类调用使用了两个额外配置：

```ts
const chatModel = createChatModel({
  disableStreaming: true,
})

await model.invoke(messages, {
  tags: ['nostream'],
})
```

- `disableStreaming: true`：分类结果是内部控制信息，不需要像最终回答一样逐字输出。
- `tags: ['nostream']`：给本次运行附加追踪标签，便于在支持标签的日志或追踪系统中识别这类调用。标签本身不会自动关闭流式输出，真正控制行为的是模型配置。

## 14. 获取最后一条用户消息

工具函数 `getLastUserMessage` 使用 `findLast` 从后向前寻找人类消息：

```ts
export function getLastUserMessage(messages: BaseMessage[]) {
  return messages.findLast(message => message.type === 'human')
}
```

不能简单使用 `messages.at(-1)`，因为消息历史的最后一项可能是 AI 消息或工具消息。按 `type === 'human'` 查找才能得到最近一次真正的用户输入。

项目同时把 TypeScript 的 `lib` 调整为 `ESNext`，以便类型系统识别 `Array.prototype.findLast`。部署时仍要确保实际 Node.js 版本支持该 API；当前 `langgraph.json` 指定 Node.js 20，可以满足要求。

### 边界情况

当消息列表中没有用户消息时，`findLast` 会返回 `undefined`。当前分类节点会把该值传给模型，因此后续应在入口校验或工具函数中明确处理“缺少用户消息”的情况。

## 15. 扩展后的图状态

状态不再只有 `messages`，还包含编辑器运行所需的数据：

```ts
export const State = new StateSchema({
  messages: MessagesValue,
  page: z.record(z.string(), z.json()),
  selectedNodeIds: z.array(z.string()),
  schema: z.object({
    material: z.array(z.record(z.string(), z.json())),
    canvas: z.record(z.string(), z.json()),
  }),
  classification: ClassificationSchema,
})
```

| 状态字段          | 用途                                             |
| ----------------- | ------------------------------------------------ |
| `messages`        | 保存用户、模型等对话消息                         |
| `page`            | 保存当前页面数据，目前会读取 `nodes` 和 `canvas` |
| `selectedNodeIds` | 保存用户当前选中的节点 ID                        |
| `schema.material` | 描述可用物料及其属性结构                         |
| `schema.canvas`   | 描述画布支持的配置结构                           |
| `classification`  | 保存分类节点输出的任务类型                       |

`z.record(z.string(), z.json())` 适合接收键名动态、值为 JSON 的对象。它比完全不校验的任意对象更安全，但约束仍然比较宽松。等页面协议稳定后，可以把 `page`、`material` 和 `canvas` 逐步替换为更具体的 Schema。

## 16. 条件边如何完成任务分发

图通过 `addConditionalEdges` 读取分类结果：

```ts
.addConditionalEdges(
  'classifyTask',
  state => state.classification.task,
  {
    message: 'handleMessageTask',
    edit: 'handleEditTask',
    page: 'handlePageTask',
  }
)
```

它包含三个组成部分：

1. `'classifyTask'`：条件判断发生在哪个节点之后。
2. 路由函数：从状态中取出 `message`、`edit` 或 `page`。
3. 映射表：把路由值映射到真正执行的节点名。

由于分类结果已经受枚举 Schema 限制，映射表可以覆盖所有合法分支。三个任务节点执行后都通过固定边进入 `END`，因此当前每次图运行只处理一种任务，不会在任务节点之间循环。

## 17. 普通问答节点如何注入编辑器上下文

`handleMessageTask` 不再只把原始消息列表交给模型，而是重新组装最后一条用户消息：

```text
系统角色提示
  + 之前的对话历史
  + 最后一个用户问题
  + 当前页面 nodes / canvas
  + 当前选中的节点 selectedNodeIds
  + canvas Schema
  + material Schema
```

代码先复制消息列表并取出最后一项：

```ts
const _messages = [...messages]
const lastMessage = _messages.pop()
```

然后把最后一条消息的文本与编辑器状态组合成新的 `HumanMessage`。这样做的目的，是让模型不仅理解用户的问题，还能根据当前页面的真实数据回答，例如“选中的组件是什么”“页面上有多少节点”等。

使用 `JSON.stringify(value, null, 2)` 能让对象以缩进后的 JSON 出现在提示词中，便于模型识别层级。不过页面和物料数据增大后，会明显增加 Token 消耗，后续可考虑：

- 只传与用户问题相关的节点和 Schema。
- 对大对象裁剪无关字段。
- 为上下文设置体积或 Token 上限。
- 对敏感字段进行过滤。

### 当前假设

该节点假设消息列表最后一项就是本轮用户消息，并直接读取 `lastMessage.text`。如果图可能从其他节点恢复、末尾出现工具消息，或输入消息为空，就需要改为复用 `getLastUserMessage` 并增加空值处理。

## 18. 模型工厂支持调用级参数

`createChatModel` 现在允许调用者传入 `ChatOpenAI` 构造参数：

```ts
export function createChatModel(
  options?: ConstructorParameters<typeof ChatOpenAI>[0]
) {
  return new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL,
    modelKwargs: { store: false },
    ...options,
  })
}
```

`ConstructorParameters<typeof ChatOpenAI>[0]` 直接复用了 SDK 构造函数的参数类型，不需要在项目里重复维护一份配置接口。

展开运算符 `...options` 放在默认值之后，因此调用方可以覆盖默认配置。例如分类节点可以设置 `disableStreaming: true`。需要注意，如果调用方传入新的 `modelKwargs`，会整体替换默认的 `{ store: false }`，而不是进行深层合并。

另外，当前代码已经注释掉 `useResponsesApi: true`，所以前文第 5 节描述的是第一阶段配置；是否启用 Responses API 现在取决于 SDK 默认行为及后续显式配置。

## 19. 页面生成与编辑节点仍是占位实现

`handleEditTask` 和 `handlePageTask` 当前只返回固定的 `AIMessage`：

```ts
return {
  messages: [new AIMessage('接到任务：根据用户的意图，修改大屏的字典。')],
}
```

它们已经验证了条件路由能够到达正确分支，但尚未真正生成或修改页面数据。后续实现时，应让节点返回明确的数据变更，而不只是自然语言说明。

一种可继续演进的职责划分是：

- `handlePageTask`：根据用户描述和物料 Schema 生成完整页面结构。
- `handleEditTask`：根据用户意图、当前页面和选中节点生成局部修改。
- 结构校验节点：使用 Zod 验证模型产生的页面或补丁。
- 应用节点：将验证后的结果写回 `page` 状态。

## 20. 第二阶段总结

这一阶段完成了 Agent 从“统一回答”到“先理解任务，再分派处理”的升级：

1. Zod Schema 约束分类结果。
2. 结构化输出提高路由稳定性。
3. 条件边将三类意图送入专用节点。
4. 状态加入页面、选中节点和编辑器 Schema。
5. 普通问答节点开始依据编辑器真实上下文回答。
6. 模型工厂支持不同节点覆盖调用配置。

当前最值得继续的方向，是实现 `page` 和 `edit` 分支的结构化输出、状态更新与校验闭环。

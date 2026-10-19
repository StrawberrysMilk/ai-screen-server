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

---

## 21. 第三阶段：编辑请求的计划与执行

编辑分支已经从固定回复升级为两步处理：先把用户需求拆成 `editPlan`，再逐项执行计划并收集 `actions`。

```text
classifyTask(task = edit)
        │
        ▼
handlePlanEdit
        │
        ├─ editPlan 为空 ─────────► END（返回补充信息）
        │
        └─ editPlan 有内容
                │
                ▼
          handleEditTask
                │
                ▼
          handleEditResult
                │
                ▼
               END
```

当前完整图的关键边定义如下：

```ts
.addConditionalEdges('classifyTask', state => state.classification.task, {
  message: 'handleMessageTask',
  page: 'handlePageTask',
  edit: 'handlePlanEdit',
})
.addConditionalEdges('handlePlanEdit', state => {
  return state.editPlan.length > 0 ? 'handleEditTask' : END
})
.addEdge('handleEditTask', 'handleEditResult')
.addEdge('handleEditResult', END)
```

这种拆分把“理解用户要做什么”和“真正操作节点”分开。计划节点可以一次产生多个操作，执行节点则只处理已经明确的单节点任务。

## 22. 编辑计划的数据结构

`planEdit.ts` 定义了三个操作类型：

```ts
export const ADD_NODE = 'add_node'
export const UPDATE_NODE = 'update_node'
export const REMOVE_NODE = 'remove_node'
```

每个计划项包含四个字段：

| 字段     | 含义                              |
| -------- | --------------------------------- |
| `action` | 新增、更新或删除                  |
| `id`     | 目标节点 ID；新增时为 `null`      |
| `type`   | 物料类型，必须来自当前可用物料    |
| `prompt` | 传给节点生成/修改模型的独立提示词 |

计划模型还会返回一个可空的 `message`：

- 可以执行时，`editPlan` 有内容，`message` 为 `null`。
- 信息不足或目标不明确时，`editPlan` 为空，`message` 描述需要补充的信息。

`handlePlanEdit` 会把当前物料压缩为 `{ type, name }` 列表，把当前节点、选中节点 ID 和画布尺寸放入系统提示词，让模型根据编辑器真实状态规划操作顺序。

### 为什么每项只处理一个节点

每项 `prompt` 必须能单独说明一个节点的内容、样式和布局。这样执行阶段可以逐项调用模型，某个节点失败时更容易定位，也能让新增、更新和删除保持清晰的动作边界。

## 23. 计划为空时的反馈路径

当模型返回空计划或带有 `message` 时，`handlePlanEdit` 不进入执行节点，而是再次调用聊天模型，把缺失信息改写成给用户看的自然语言：

```ts
if (!result.editPlan.length || result.message) {
  const message = await chatModel.invoke([
    new SystemMessage('你是大屏的信息反馈助手...'),
    new HumanMessage(result.message),
  ])

  return {
    messages: [message],
    editPlan: [],
    actions: [],
  }
}
```

这条路径的好处是把内部的规划结果与用户交互隔离：用户只看到需要补充什么，不会看到 `editPlan`、Schema 或内部字段。

当前实现依赖 `result.message` 在该分支中有内容。生产实现应为它设置兜底文本，并对模型返回的结构做更严格的空值校验。

## 24. 三类节点动作的执行方式

`handleEditTask` 遍历计划并把动作写入 `actions`：

### 新增节点

`add_node` 会根据物料类型找到物料 Schema，再调用 `generateNode`。生成结果会补充服务端负责的字段：

```ts
return {
  ...node,
  id: crypto.randomUUID(),
  type: materialSchema.type,
}
```

模型只负责生成符合物料配置的内容，节点 ID 和类型由代码写入，避免模型自行生成不稳定的标识。

### 更新节点

`update_node` 根据计划中的 `id` 从 `state.page.nodes` 找到当前节点，然后把原节点 JSON 放入提示词。模型只返回可编辑配置，代码再次强制保留原节点的 `id` 和 `type`：

```ts
return {
  ...node,
  id: currentNode.id,
  type: currentNode.type,
}
```

提示词明确允许修改 `props`、`layout`、`style` 等属性，并禁止修改基础标识。这是“模型提议变更，代码守住身份字段”的典型边界。

### 删除节点

`remove_node` 不需要再次调用模型，直接把当前节点放入动作列表，前端或后续应用层根据动作类型删除它。

## 25. 动作结果与最终回复

`handleEditTask` 返回：

```ts
return {
  actions,
}
```

它暂时没有直接写回 `page`，而是把结构化动作交给 `handleEditResult`。后者调用模型生成面向用户的最终反馈，并要求模型：

- 只描述动作中真实存在的结果。
- 不展示 JSON、Schema、代码或内部执行过程。
- 说明新增或修改了哪些节点及主要变化。

完成回复后，节点返回 `actions: []`，避免动作结果在后续状态读取中重复使用。真正把动作应用到画布数据的职责目前仍在图外，通常由前端 reducer、服务端应用节点或持久化层完成。

## 26. ECharts RAG 知识库的素材

`resources/echarts/` 下的 JSON 文件来自 ECharts option 配置说明。当前素材覆盖：

- `dataset`
- `grid`
- `legend`
- `series.bar`
- `series.line`
- `series.pie`
- `title`
- `tooltip`
- `xAxis`
- `yAxis`

每个文件是一个配置对象，属性通常包含 `desc` 字段，字段名可能是相对路径，例如 `barWidth`、`source` 或 `textStyle.color`。构建脚本会为它们补上文件级前缀，形成可检索的完整路径，例如：

```text
option.series-bar.json + barWidth
        ↓
series.bar.barWidth
```

路径参与检索文本后，模型查询“柱状图柱宽”时更容易命中正确的系列配置，而不是只匹配到含义相似的通用字段。

## 27. 从文档到向量的构建流程

`src/scripts/build-echarts-rag.ts` 是离线知识库构建脚本，流程如下：

1. 读取 `resources/echarts/` 中的所有 JSON 文件。
2. 将每个配置对象展开成 `{ id, path, description }` 知识片段。
3. 用 `cleanDescription` 清理 HTML 标签、脚本、样式、列表和连续空白。
4. 拼接 `ECharts 配置 ${path}\n${description}` 作为向量化文本。
5. 每批最多处理 10 条文本，调用 Embedding 模型生成向量。
6. 将知识片段和向量写入 `data/rag.sqlite`。

`cleanDescription` 先删除 `<script>`、`<style>` 和 `<iframe>` 内容，再把段落、列表和代码块结束转换成换行，最后去掉剩余标签。这样可以保留文档的基本层级，同时避免把网页 HTML 直接送给 Embedding 模型。

批大小为 10 是当前 Embedding 服务的请求限制；`createEmbeddingModel` 也设置了 `batchSize: 10`、`maxConcurrency: 1` 和 `maxRetries: 0`，以降低请求过大、并发过高和失败重试导致的不可控行为。

## 28. SQLite 与 sqlite-vec 的向量检索

`src/rag/database.ts` 使用两个表保存知识库：

```sql
CREATE TABLE chunks (
  rowid INTEGER PRIMARY KEY,
  chunk_id TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE VIRTUAL TABLE chunk_vectors USING vec0(
  embedding float[维度] distance_metric=cosine
);
```

普通表保存可读的文档信息，`vec0` 虚拟表保存向量。写入时先插入 `chunks`，取得 SQLite 的 `rowid`，再使用同一个 `rowid` 插入向量。两个表因此可以通过 `rowid` 关联。

向量维度从第一条向量动态读取：

```ts
const dimensions = vectors[0].length
```

这要求构建批次非空，并要求同一知识库中的所有向量维度一致。写入和查询都调用 `sqliteVec.load(db)`，因为每个 SQLite 连接都需要加载扩展后才能使用 `vec0`。

查询使用余弦距离：

```sql
WHERE v.embedding MATCH ? AND k = ?
ORDER BY v.distance
```

`searchKnowledgeDatabase` 以只读方式打开数据库，返回最接近的 `topK` 条记录。当前实现保留了 `distance` 字段供数据库层排序，但上层工具会把它过滤掉。

## 29. ECharts 检索工具如何被 Agent 调用

`searchEChartsOptions` 使用 LangChain `tool` 声明一个可调用工具：

```ts
export const searchEChartsOptions = tool(
  async ({ query }) => {
    const vector = await createEmbeddingModel().embedQuery(query)
    const chunks = searchKnowledgeDatabase(vector, 3)
    return JSON.stringify(
      chunks.map(chunk => ({
        path: chunk.path,
        description: chunk.description,
      }))
    )
  },
  {
    name: 'search_echarts_options',
    schema: z.object({ query: z.string() }),
  }
)
```

节点生成和节点更新 Agent 都注册了这个工具。模型可以先提出自然语言查询，工具完成 Embedding 和向量检索，再把最多三条配置路径与说明返回给模型。返回结果不包含距离值，避免把数据库内部排序指标暴露给生成模型。

这形成了一个轻量 RAG 闭环：

```text
用户编辑要求
   ▼
节点 Agent 判断是否需要 ECharts 配置知识
   ▼
search_echarts_options
   ▼
查询向量 → sqlite-vec → 配置路径与说明
   ▼
Agent 生成符合物料 Schema 的节点配置
```

## 30. `createAgent` 与结构化节点输出

新增和更新节点使用 LangChain 的 `createAgent`，并通过 `toolStrategy(materialSchema.configSchema)` 约束最终结构化响应：

```ts
const agent = createAgent({
  model,
  tools: [searchEChartsOptions],
  responseFormat: toolStrategy(materialSchema.configSchema),
  systemPrompt: '...',
})
```

这里同时存在两类结构化约束：

- `searchEChartsOptions` 的输入由工具自己的 Zod Schema 校验。
- 节点最终结果由物料的 `configSchema` 校验。

生成 Agent 使用普通 `createChatModel`，允许模型调用工具并生成结果；更新 Agent 使用 `createNonStreamingModel`，适合内部执行阶段。生成结果的 `structuredResponse` 被转换为节点对象，然后由代码补全或覆盖 `id`、`type`。

当前实现传入的是 `materialSchema.configSchema` 的原始结构。如果该字段仍是 JSON Schema 而不是 LangChain 可直接识别的 Zod Schema，需要在运行前统一转换，否则结构化输出可能无法按预期工作。

## 31. 模型工厂与 Embedding 配置

`src/ai/model.ts` 现在集中提供三类能力：

```ts
createChatModel() // 普通聊天模型
createNonStreamingModel() // 禁止流式输出的内部调用
createEmbeddingModel() // ECharts 文档和查询向量
```

Embedding 使用独立的环境变量：

| 环境变量                    | 用途               |
| --------------------------- | ------------------ |
| `OPENAI_EMBEDDING_MODEL`    | Embedding 模型名称 |
| `OPENAI_EMBEDDING_BASE_URL` | Embedding 服务地址 |
| `OPENAI_EMBEDDING_API_KEY`  | Embedding 服务密钥 |

聊天模型仍使用 `OPENAI_CHAT_MODEL` 等配置。将聊天与 Embedding 的地址、模型和密钥分开，便于使用不同服务或不同模型承担生成与检索任务。

`createNonStreamingModel` 在 `createChatModel` 上统一设置 `disableStreaming: true` 和 `tags: ['nostream']`。分类、编辑规划和节点更新都可复用这条配置，避免每个节点重复声明。

## 32. 运行 RAG 构建脚本

应用新增了脚本命令：

```bash
cd apps/agent-server
pnpm rag
```

该命令通过 `.env` 加载环境变量，读取本地 ECharts 资源，调用 Embedding 服务，并生成：

```text
apps/agent-server/data/rag.sqlite
```

重新构建知识库前，需要确认目标 SQLite 文件是否需要重建。当前 `writeKnowledgeDatabase` 使用 `CREATE TABLE` 和 `CREATE VIRTUAL TABLE`，若数据库已经存在相同表名，重复运行可能因为表已存在而失败。更稳妥的做法是显式删除旧库、使用临时库替换，或在写入前实现版本化迁移。

脚本还依赖本地 Node.js 对 `.ts` 入口的支持，以及 `better-sqlite3`、`sqlite-vec` 的原生模块。部署或 CI 环境应先确认 Node 版本、操作系统和原生依赖可用。

## 33. 当前验证结果与待修复项

本次检查中，应用构建命令：

```bash
pnpm --filter agent-server build
```

未通过，错误来自 `tsconfig.json`：

```text
TS5096: Option 'allowImportingTsExtensions' can only be used when one of
'noEmit', 'emitDeclarationOnly', or 'rewriteRelativeImportExtensions' is set.
```

当前 `build` 同时执行 `tsc` 和 `tsc-alias`，因此应在后续整理或实现时选择一种一致方案：

- 移除 `allowImportingTsExtensions`，把源码导入统一写成构建后的 `.js` 路径。
- 或配置 `rewriteRelativeImportExtensions`，让 TypeScript 在输出阶段重写扩展名。
- 或仅在专门的脚本配置中允许 `.ts` 扩展名，把生产构建配置与脚本执行配置分开。

这项错误与 RAG 逻辑无关，但会阻止应用通过正式构建流程。RAG 脚本是否能独立运行，还需要在配置好 Embedding 服务后进行实际调用验证。

## 34. 当前完整执行链路

从一次用户请求开始，当前 Agent 的主要流程是：

1. `classifyTask` 判断请求属于普通问答、创建页面还是编辑页面。
2. 普通问答进入 `handleMessageTask`，结合页面上下文回答。
3. 创建页面进入 `handlePageTask`，当前仍是待完善分支。
4. 编辑页面进入 `handlePlanEdit`，根据物料、节点和选中状态生成 `editPlan`。
5. 没有足够信息时直接反馈补充问题并结束。
6. 有计划时进入 `handleEditTask`，依次执行新增、更新或删除。
7. 新增和更新节点 Agent 可调用 ECharts RAG 工具查询配置说明。
8. 执行结果写入 `actions`，`handleEditResult` 将真实动作改写成用户可读反馈。
9. 画布应用层根据 `actions` 更新页面；当前图本身暂未把动作直接合并回 `page`。

这套结构已经形成了从意图识别、任务规划、工具检索、结构化生成到结果反馈的基本 Agent 工作流。

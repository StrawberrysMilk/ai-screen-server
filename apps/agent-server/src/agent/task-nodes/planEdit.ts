import { createChatModel, createNonStreamingModel } from '@/ai/model.js'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'

export const ADD_NODE = 'add_node'
export const UPDATE_NODE = 'update_node'
export const REMOVE_NODE = 'remove_node'
export const ADD_DATA_SOURCE = 'add_data_source'
export const UPDATE_DATA_SOURCE = 'update_data_source'

export const ActionSchemaType = z
  .enum([
    ADD_NODE,
    UPDATE_NODE,
    REMOVE_NODE,
    ADD_DATA_SOURCE,
    UPDATE_DATA_SOURCE,
  ])
  .describe(
    `用户意图的操作类型,当前唯一开放的二级分类：${ADD_NODE} = 新增一个节点，${UPDATE_NODE} = 更新一个节点，${REMOVE_NODE} = 删除一个节点，${ADD_DATA_SOURCE} = 新增一个数据源，${UPDATE_DATA_SOURCE} = 更新一个数据源`
  )

export const PlanEditSchema = z.object({
  action: ActionSchemaType,
  id: z
    .string()
    .nullable()
    .describe(
      '需要操作的节点的唯一标识, 比如用户要修改,那就是要修改 节点的/数据源 的 id, 删除节点就是要删除 节点的/数据源 的 id, 新增节点到时候就是 null'
    ),
  type: z
    .string()
    .nullable()
    .describe('节点的类型，如果操作的是数据源，则为 null'),
  prompt: z
    .string()
    .describe('传给节点生成或修改模型的提示词,包括内容样式和布局要求等'),
})
export async function handlePlanEdit(state) {
  const materials = state.schema.material.map(item => {
    return {
      type: item.type,
      name: item.name,
    }
  })
  const dataSources = state.dataSources.map(item => {
    return {
      id: item.id,
      name: item.name,
      type: item.type,
    }
  })
  const nodes = state.page.nodes.map(item => {
    return {
      id: item.id,
      name: item.name,
      type: item.type,
    }
  })
  const model = createNonStreamingModel().withStructuredOutput(
    z.object({
      editPlan: z.array(
        PlanEditSchema.extend({
          type: z
            .enum(materials.map(item => item.type))
            .describe('节点的类型，必须是可用物料中的类型'),
          // id: z
          //   .enum(nodes.map(item => item.id))
          //   .nullable()
          //   .describe(
          //     '当前已有的节点的id，修改和删除节点必须是已有节点的id，新增节点为null'
          //   ),
        })
      ),
      message: z
        .string()
        .nullable()
        .describe('给用户的信息，告诉用户缺少哪些信息'),
    }),
    {
      name: 'edit_plan',
      method: 'jsonSchema',
    }
  )

  const result = await model.invoke([
    new SystemMessage(`
      请把用户要求整理成按执行顺序排列的 editPlan，每项只处理一个对象。
      节点编辑规则：
      - add_node 的 id 为 null。
      - update_node 和 remove_node 必须复制已有节点的真实 id 和 type。
      - 节点操作的 type 必须是可用物料中的真实类型。
      - 每项 prompt 必须能独立说明该节点的内容、样式和布局要求。

      数据源规则：
      - 用户要创建、添加、准备一份静态数据或 API 数据源时使用 add_data_source，id 和 type 为 null。
      - 用户要修改已有数据源的名称、数据或 API 配置时使用 update_data_source；从已有数据源中复制真实 id，type 为 null。
      - 若无法确定要修改哪一个数据源，返回空 editPlan，并通过 message 询问目标数据源。
      - 不要把数据源操作理解为节点操作；只有用户明确要求图表、文本、指标等画布物料时才使用节点操作。
      - 用户不需要使用固定格式，也不需要主动说明 JSON、字段名或数据行。
      - prompt 必须明确这是 static 还是 api 数据源；修改时说明具体要改的内容，不要要求重新创建数据源，也不要改变数据源类型。

      静态数据源规则：
      - 从自然语言中的业务对象、分类、指标和数值归纳出语义清楚且稳定的字段名。
      - 只有 data 行内的数据字段名必须使用有业务含义的英文 lowerCamelCase，不能使用中文；在 prompt 中明确英文键与中文含义，例如 month（月份）、salesAmount（销售额）。
      - 只转换字段名，数据中的名称、分类等文本值必须保留用户原文，不能翻译、缩写或改写。例如“一号泵”必须仍为“一号泵”。
      - 用户没有明确命名数据源时，根据业务主题生成简短名称，不要为名称追问；name 是展示名称，应沿用用户使用的语言，可以是中文。
      - 用户已经表达出各条实际数据时，把它们整理到 prompt；不能要求用户改写成结构化格式。
      - “是/否、需要/不需要”等明确的二元状态必须归纳为 boolean，明确表示没有值时归纳为 null，并在 prompt 中写清楚。
      - “示例、模拟、演示、随便生成几条”等表达都视为用户允许生成示例数据，并在 prompt 中保留这项授权。
      - 创建静态数据源时，只有用户既没有提供实际数据，也没有允许生成示例数据，才返回空 editPlan，并通过 message 询问数据内容或是否允许生成示例数据。修改已有数据源时可以只提供需要改的部分。

      API 数据源规则：
      - 用户提到 API、接口或 URL 时，规划为 api 数据源。
      - 创建 API 数据源必须有真实 URL；缺少 URL 时返回空 editPlan，并通过 message 询问接口地址。修改已有 API 数据源时保留原 URL，除非用户明确要求更改。
      - 创建 API 数据源且请求方式未说明时按 get 处理；修改时保留原请求方式，除非用户明确要求更改。
      - 创建 API 数据源时，用户提供了初始值或默认值就完整写入 prompt；没有提供时明确写为 null，不能猜测为数组或对象。修改时保留未提及的初始值。
      - 参数、响应数据路径和轮询间隔只有用户明确提供时才写入 prompt，不能猜测。
      - prompt 必须是后续生成步骤可独立理解的自然语言要求。创建静态数据源需明确名称、字段含义、实际数据或示例数据授权；创建 API 数据源需明确名称、URL、请求方式以及用户提供的可选配置。
      如果根据用户提示词无法完成要求，或者用户目标不明确，返回空 editPlan，并通过 message 一次问清楚；如果可以完成规划，则 message 返回 null。

      可用物料：${JSON.stringify(materials, null, 2)}
      已有节点：${JSON.stringify(nodes, null, 2)}
      已有数据源：${JSON.stringify(dataSources, null, 2)}
      selectedNodeIds：${JSON.stringify(state.selectedNodeIds, null, 2)}
      画布尺寸：${JSON.stringify(state.page.canvas, null, 2)}
    `),
    ...state.messages,
  ])

  if (!result.editPlan.length || result.message) {
    const chatModel = createChatModel()
    const message = await chatModel.invoke([
      new SystemMessage(`
      你是一个 AI 大屏的信息反馈助手，当前根据已有信息无法完成任务，请让用户提供完整的信息
        `),
      new HumanMessage(result.message),
    ])
    return {
      messages: [message],
      editPlan: [],
      actions: [],
    }
  }

  return {
    editPlan: result.editPlan,
  }
}

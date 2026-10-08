import { createChatModel, createNoStreamingModel } from '@/ai/model.js'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'

export const ADD_NODE = 'add_node'
export const UPDATE_NODE = 'update_node'
export const REMOVE_NODE = 'remove_node'

export const ActionSchemaType = z
  .enum([ADD_NODE, UPDATE_NODE, REMOVE_NODE])
  .describe(
    `用户意图的操作类型,当前唯一开放的二级分类：${ADD_NODE} = 新增一个节点，${UPDATE_NODE} = 更新一个节点，${REMOVE_NODE} = 删除一个节点`
  )

export const PlanEditSchema = z.object({
  action: ActionSchemaType,
  id: z
    .string()
    .nullable()
    .describe(
      '需要操作的节点的唯一标识, 比如用户要修改,那就是要修改节点的 id, 删除节点就是要删除节点的 id, 新增节点到时候就是 null'
    ),
  type: z.string().describe('节点的类型'),
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
  const nodes = state.page.nodes
  const model = createNoStreamingModel().withStructuredOutput(
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
      请把用户要求整理成按执行顺序排列的 editPlan，每项只处理一个节点。
      ${ADD_NODE} 的 id 为 null。
      ${UPDATE_NODE} 和 ${REMOVE_NODE} 必须复制已有节点的真实 id 和 type。
      每项 prompt 必须能独立说明该节点的内容、样式和布局要求。
      如果根据用户提示词无法完成要求，或者用户目标不明确，返回空 editPlan，并通过 message 一次问清楚，如果可以完成规划，则 message 返回 null

      可用物料：${JSON.stringify(materials, null, 2)}
      已有节点：${JSON.stringify(nodes, null, 2)}
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

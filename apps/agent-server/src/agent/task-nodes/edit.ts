// 修改大屏字典
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { SystemMessage } from '@langchain/core/messages'
import { createNoStreamingModel } from '@/ai/model.js'
import { ADD_NODE, REMOVE_NODE, UPDATE_NODE } from './planEdit.js'

async function generateNode(materialSchema, prompt) {
  const schema = z.fromJSONSchema(materialSchema.configSchema)

  const model = createNoStreamingModel().withStructuredOutput(
    schema.extend({
      id: z.literal(crypto.randomUUID()).describe('节点唯一 ID'),
      type: z.literal(materialSchema.type).describe('节点类型'),
    }),
    {
      name: 'add_node_schema',
      method: 'jsonSchema',
    }
  )
  return await model.invoke([
    new SystemMessage(`
      你是一个 AI 大屏设计器的节点生成助手。
      请根据用户要求生成一个完整的 ${materialSchema.name} 节点。
      必须遵守结构化输出 Schema。
      对于可选属性，如果用户没有明确要求，可以留空。
    `),
    new HumanMessage(prompt),
  ])
}

export async function updateNode(currentNode, materialSchema, prompt) {
  // 实现更新节点的逻辑
  const schema = z.fromJSONSchema(materialSchema.configSchema) as z.ZodObject
  const model = createNoStreamingModel().withStructuredOutput(
    // materialSchema.configSchema,
    schema,
    {
      name: 'material_node',
      method: 'jsonSchema',
    }
  )
  const res = await model.invoke([
    new SystemMessage(`
      你是一个 AI 大屏设计器的节点修改助手。
      当前选中的节点是 ${materialSchema.name}，请根据用户的要求修改该节点。
      必须遵守结构化输出 Schema。
      对于可选属性，如果用户没有明确要求，可以留空。

      规则：
       - 只能修改当前节点的 props, layout, events，style 等配置，不能修改节点的 type、id、name 等基础信息。
       - 禁止修改节点的 id，type 等属性
      当前节点的内容：

      ${JSON.stringify(currentNode, null, 2)}
    `),
    new HumanMessage(prompt),
  ])

  return {
    ...res,
    id: currentNode.id,
    type: currentNode.type,
  }
}

export async function handleEditTask(state) {
  const plans = state.editPlan
  const actions = []
  for (const plan of plans) {
    const { type, id, action, prompt } = plan
    const schema = state.schema.material.find(m => m.type === type)
    if (action === ADD_NODE) {
      // 处理新增节点的逻辑
      const node = await generateNode(schema, prompt)
      actions.push({
        node,
        type: ADD_NODE,
      })
    }
    // 处理更新节点的逻辑
    const currentNode = state.page.nodes.find(node => node.id === id)
    if (action === UPDATE_NODE) {
      // 处理更新节点的逻辑
      // const selectedNodeId = state.selectedNodeIds[0]
      // if (!selectedNodeId) {
      //   return {
      //     messages: [
      //       new AIMessage('当前没有选中任何节点，请先选中一个节点再进行修改。'),
      //     ],
      //   }
      // }
      const node = await updateNode(currentNode, schema, prompt)
      actions.push({
        node,
        type: UPDATE_NODE,
      })
    }
    if (action === REMOVE_NODE) {
      // 删除
      actions.push({
        node: currentNode,
        type: REMOVE_NODE,
      })
    }
  }
  return {
    actions,
  }
}

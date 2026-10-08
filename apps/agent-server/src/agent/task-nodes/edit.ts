// 修改大屏字典
import { AIMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { SystemMessage } from '@langchain/core/messages'
import { createNoStreamingModel } from '@/ai/model.js'
import { getLastUserMessage } from '@/utils/index.js'

/**
 * 获取新增节点的 schema
 * @param state
 */
async function getMaterialSchema(state) {
  console.log(state, 'state')
  /**
   * 获取到新增节点的 schema
   * 1. 用户提示词
   * 2. 所有物料的 schema
   */
  const materialSchema = state.schema.material
  const materials = materialSchema.map(m => {
    return {
      type: m.type,
      name: m.name,
    }
  })
  const model = createNoStreamingModel().withStructuredOutput(
    z.object({
      type: z.enum(materialSchema.map(m => m.type)).describe('节点的类型'),
    }),
    {
      name: 'material_schema',
      method: 'jsonSchema',
    }
  )

  const res = await model.invoke([
    new SystemMessage(`
      你是一个 AI 大屏设计器的物料选择助手。
      请根据用户的要求，从下面的可用物料中选择最合适的一个。
      可用物料：
      ${JSON.stringify(materials, null, 2)}
    `),
    getLastUserMessage(state.messages),
  ])

  return materialSchema.find(m => m.type === res.type)
}

async function generateNode(state, materialSchema) {
  const schema = z.fromJSONSchema(materialSchema.configSchema)

  const model = createNoStreamingModel().withStructuredOutput(
    schema.extend({
      id: z.literal(crypto.randomUUID()).describe('节点唯一 ID'),
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
    getLastUserMessage(state.messages),
  ])
}

export async function updateNode(state, currentNode, materialSchema) {
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
    getLastUserMessage(state.messages),
  ])

  return {
    ...res,
    id: currentNode.id,
    type: currentNode.type,
  }
}

export async function handleEditTask(state) {
  if (state.classification.operation === 'add_node') {
    /**
     * 新增节点
     * 1. 快速获取到新增节点的 schema
     * 2. 根据用户提示词结合 schema 生成节点的配置
     */
    const schema = await getMaterialSchema(state)

    const node = await generateNode(state, schema)
    return {
      action: {
        type: 'add_node',
        node,
      },
    }
  } else if (state.classification.operation === 'update_node') {
    /**
     * 修改节点
     * 1. 获取当前选中的节点
     * 2. 根据用户提示词结合 schema 生成节点的配置
     */
    const selectedNodeId = state.selectedNodeIds[0]
    if (!selectedNodeId) {
      return {
        messages: [
          new AIMessage('当前没有选中任何节点，请先选中一个节点再进行修改。'),
        ],
      }
    }

    const currentNode = state.page.nodes.find(
      node => node.id === selectedNodeId
    )
    // const schema = await getMaterialSchema(state)
    const schema = state.schema.material.find(m => m.type === currentNode.type)
    if (!schema) {
      return {
        messages: [
          new AIMessage(
            `当前选中的节点类型 ${currentNode.type} 没有对应的 schema，请检查物料配置。`
          ),
        ],
      }
    }
    const node = await updateNode(state, currentNode, schema)
    return {
      action: {
        type: 'update_node',
        node,
      },
    }
  }
  return {
    messages: [new AIMessage('接到任务：根据用户的意图，修改大屏的字典。')],
  }
}

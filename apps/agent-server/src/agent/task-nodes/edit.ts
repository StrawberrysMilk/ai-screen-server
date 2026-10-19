// 修改大屏字典
import { HumanMessage } from '@langchain/core/messages'
import { createNonStreamingModel, createChatModel } from '@/ai/model.js'
import { ADD_NODE, REMOVE_NODE, UPDATE_NODE } from './planEdit.js'
import { searchEChartsOptions } from '@/rag/tools.ts'
import { createAgent, toolStrategy } from 'langchain'

async function generateNode(materialSchema, prompt) {
  const agent = createAgent({
    model: createChatModel(),
    tools: [searchEChartsOptions],
    responseFormat: toolStrategy(materialSchema.configSchema),
    systemPrompt: `
      你是一个 AI 大屏设计器的节点生成助手。
      请根据用户要求生成一个完整的 ${materialSchema.name} 节点。
      必须遵守结构化输出 Schema。
      对于可选属性，如果用户没有明确要求，可以留空。
      如果是图表物料，使用的是 ECharts，props.option 必须使用 ECharts 的配置字段完成。

      如果需要确认 ECharts 配置字段、嵌套路径或字段含义，
      可以调用 search_echarts_options 查询 ECharts 官方配置。
    `,
  })

  const result = await agent.invoke({
    messages: [new HumanMessage(prompt)],
  })

  const node = result.structuredResponse as Record<string, unknown>

  return {
    ...node,
    id: crypto.randomUUID(),
    type: materialSchema.type,
  }
}

export async function updateNode(currentNode, materialSchema, prompt) {
  const agent = createAgent({
    model: createNonStreamingModel(),
    tools: [searchEChartsOptions],
    responseFormat: toolStrategy(materialSchema.configSchema),
    systemPrompt: `
      你是一个 AI 大屏设计器的节点修改助手。
      当前选中的节点是 ${materialSchema.name}，请根据用户的要求修改该节点。
      必须遵守结构化输出 Schema。
      对于可选属性，如果用户没有明确要求，可以留空。
      如果是图表物料，使用的是 ECharts，props.option 必须使用 ECharts 的配置字段完成。

      如果需要确认 ECharts 配置字段、嵌套路径或字段含义，
      可以调用 search_echarts_options 查询 ECharts 官方配置。

      规则：
       - 只能修改当前节点的 props、layout、style 等属性。
       - 禁止修改节点的 id、type 等属性。

      当前节点的内容：

      ${JSON.stringify(currentNode, null, 2)}
    `,
  })

  const result = await agent.invoke({
    messages: [new HumanMessage(prompt)],
  })

  const node = result.structuredResponse as Record<string, unknown>

  return {
    ...node,
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

// 当前做意图识别
import { z } from 'zod'
import { SystemMessage } from '@langchain/core/messages'
import { createNonStreamingModel } from '../ai/model.js'

export const ClassificationSchema = z.object({
  task: z
    .enum(['message', 'page', 'edit'])
    .describe(
      '识别用户意图的任务分类，message = 普通问答，page = 创建页面，edit = 修改页面，包括创建数据源、新增节点、修改节点或者删除节点'
    ),
})

export async function classifyTask(state) {
  const chatModel = createNonStreamingModel()

  const model = chatModel.withStructuredOutput(ClassificationSchema, {
    name: 'task_classification',
    method: 'jsonSchema',
  })

  const response = await model.invoke([
    new SystemMessage(`
        你是一个 AI 大屏设计器的意图识别助手，请根据用户输入返回一级任务分类和当前支持的二级分类。
    
        一级任务分类：
        - message: 普通问答，用户只是想问一些问题，或者获取一些信息。
        - page: 创建完整页面，用户想用一句话或者一段综合描述生成一个大屏。
        - edit: 修改当前页面，包括创建数据源、新增节点、修改节点或者删除节点。

        分类优先级：
        - 用户要求创建、添加、准备或整理一份数据、销售数据、统计数据、静态数据或 API 数据时，必须返回 edit。
        - 用户明确要求创建图表、文本、指标等画布组件时，返回 edit。
        - 只有用户明确要求“一句话生成完整大屏/页面”，或同时描述多个页面区域并要求整体生成时，才返回 page。
        - 例如“创建一份月度销售数据，一月120、二月180”是 edit，因为它要求创建数据源，不是生成完整页面。
      `),
    ...state.messages,
  ])

  // const { task } = response

  return {
    classification: response,
  }
}

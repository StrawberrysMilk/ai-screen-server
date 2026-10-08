// 当前做意图识别
import { z } from 'zod'
import { SystemMessage } from '@langchain/core/messages'
import { createNoStreamingModel } from '../ai/model.js'
import { getLastUserMessage } from '../utils/index.js'

export const ClassificationSchema = z.object({
  task: z
    .enum(['message', 'page', 'edit'])
    .describe(
      '识别用户意图的任务分类，message = 普通问答，page = 创建页面，edit = 修改页面'
    ),
  operation: z
    .enum(['add_node', 'update_node']) // 当前只完成新增节点
    .nullable()
    .describe(
      '当前唯一开放的二级分类：add_node = 新增一个节点，update_node = 更新一个节点'
    ),
})

export async function classifyTask(state) {
  const chatModel = createNoStreamingModel()

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
        - edit: 修改当前页面，包括新增节点、修改节点或者删除节点。
    
        目前只有 edit 有二级分类 operation：
        - add_node: 用户明确要求新增一个节点，例如新增一个标题、一段文本或一个图表。
        - update_node: 用户要求修改当前选中的一个节点，例如修改文本内容、字号、颜色或图表配置。
    
        规则：
        - 用户明确要求新增一个节点时，operation 返回 add_node。
        - 用户明确要求修改当前选中的一个节点时，operation 返回 update_node。
        - message、page、新增多个节点、删除节点以及其他情况，operation 都返回 null。
      `),
    getLastUserMessage(state.messages),
  ])

  // const { task } = response

  return {
    classification: response,
  }
}

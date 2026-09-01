// 当前做意图识别
import { z } from 'zod'
import { SystemMessage } from '@langchain/core/messages'
import { createChatModel } from '../ai/model.js'
import { getLastUserMessage } from '../utils/index.js'

export const ClassificationSchema = z.object({
  task: z
    .enum(['message', 'page', 'edit'])
    .describe(
      '识别用户意图的任务分类，message = 普通问答，page = 创建页面，edit = 修改页面'
    ),
})

export async function classifyTask(state) {
  const chatModel = createChatModel({
    disableStreaming: true,
  })

  const model = chatModel.withStructuredOutput(ClassificationSchema, {
    name: 'task_classification',
    method: 'jsonSchema',
  })

  const response = await model.invoke(
    [
      new SystemMessage(`
        你是一个 AI 大屏设计器助手，根据用户提示词进行意图识别。
        分类结果只能是 message、page、edit：
        - message：普通问答，尤其是询问当前页面、节点或数据源事实。
        - page：创建一个完整页面或大屏。
        - edit：修改当前页面。
      `),
      getLastUserMessage(state.messages),
    ],
    {
      tags: ['nostream'],
    }
  )

  const { task } = response

  return {
    classification: {
      task,
    },
  }
}

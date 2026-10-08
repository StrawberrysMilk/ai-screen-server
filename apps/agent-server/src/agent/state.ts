import { MessagesValue, StateSchema } from '@langchain/langgraph'
import { z } from 'zod'
import { ClassificationSchema } from './classification.js'

export const State = new StateSchema({
  messages: MessagesValue,
  page: z.record(z.string(), z.json()),
  selectedNodeIds: z.array(z.string()),
  schema: z.object({
    material: z.array(z.record(z.string(), z.json())),
    canvas: z.record(z.string(), z.json()),
  }),
  // 用户意图
  classification: ClassificationSchema,
  action: z.object({
    // task: z
    //   .enum(['message', 'page', 'edit'])
    //   .describe(
    //     '识别用户意图的任务分类，message = 普通问答，page = 创建页面，edit = 修改页面'
    //   ),
    type: z
      .enum(['add_node', 'update_node'])
      .describe(
        '当前唯一开放的二级分类：add_node = 新增一个节点，update_node = 更新一个节点'
      ),
    node: z
      .record(z.string(), z.json())
      .describe('新增节点的 schema，包含 type、name、id、layout、props 等字段'),
  }),
})

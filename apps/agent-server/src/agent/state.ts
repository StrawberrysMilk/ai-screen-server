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
    type: z
      .literal('add_node')
      .optional()
      .describe('当前唯一开放的二级分类：add_node = 新增一个节点'),
    node: z
      .record(z.string(), z.json())
      .optional()
      .describe('新增节点的 schema，包含 type、name、id、layout、props 等字段'),
  }),
})

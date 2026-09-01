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
})

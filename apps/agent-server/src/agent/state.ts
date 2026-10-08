import { MessagesValue, StateSchema } from '@langchain/langgraph'
import { z } from 'zod'
import { ClassificationSchema } from './classification.js'
import {
  ActionSchemaType,
  PlanEditSchema,
} from '@/agent/task-nodes/planEdit.js'

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
  // 编辑计划
  editPlan: z.array(PlanEditSchema).default([]),
  actions: z
    .array(
      z.object({
        type: ActionSchemaType,
        node: z
          .record(z.string(), z.json())
          .describe(
            '新增节点的 schema，包含 type、name、id、layout、props 等字段'
          ),
      })
    )
    .default([]),
})

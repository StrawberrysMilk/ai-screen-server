import { tool } from 'langchain'
import { z } from 'zod'
import { createEmbeddingModel } from '../ai/model.js'
import { searchKnowledgeDatabase } from './database.js'
// import { RAG_DB_PATH, searchKnowledgeDatabase } from './database.js'

export const searchEChartsOptions = tool(
  async ({ query }) => {
    // eslint-disable-next-line no-debugger
    console.info('search_echarts_options =>', query)

    // 把模型生成的查询文本转换成查询向量。
    const embeddings = createEmbeddingModel()
    const vector = await embeddings.embedQuery(query)

    // 在 SQLite 中查找距离最近的三条 ECharts 配置说明。
    const chunks = searchKnowledgeDatabase(vector, 3)
    // eslint-disable-next-line no-debugger
    // Agent 只需要阅读配置路径和说明，不需要使用 distance。
    return JSON.stringify(
      chunks.map(chunk => ({
        path: chunk.path,
        description: chunk.description,
      }))
    )
  },
  {
    name: 'search_echarts_options',
    description:
      '查询 ECharts 官方 option 配置。创建或修改 ECharts 图表时，如果需要确认配置字段、嵌套路径或字段含义，可以调用此工具。',
    schema: z.object({
      query: z
        .string()
        .describe('需要查询的 ECharts 配置问题，例如：柱状图柱宽如何配置'),
    }),
  }
)

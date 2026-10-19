// src/ai/model.ts
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'

export function createChatModel(
  options?: ConstructorParameters<typeof ChatOpenAI>[0]
) {
  return new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL,
    // 使用 Responses API
    // useResponsesApi: true,
    modelKwargs: {
      // 注意，咱自己做的事儿，别让它看见，不往里面存
      store: false,
      enable_thinking: false, // 禁用思考模式，避免模型在内部进行额外的推理或生成
    },
    ...options,
  })
}

export function createNonStreamingModel(
  options?: Parameters<typeof createChatModel>[0] // 获取 createChatModel 函数的参数类型
) {
  return createChatModel({
    ...options,
    disableStreaming: true, // 禁用流式输出
    tags: ['nostream'], // 添加标签，方便区分
  })
}

export function createEmbeddingModel() {
  return new OpenAIEmbeddings({
    model: process.env.OPENAI_EMBEDDING_MODEL,
    apiKey: process.env.OPENAI_EMBEDDING_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_EMBEDDING_BASE_URL,
    },
    // 单次最多处理 10 条
    batchSize: 10,
    maxConcurrency: 1,
    maxRetries: 0,
  })
}

// src/ai/model.ts
import { ChatOpenAI } from '@langchain/openai'

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
    },
    ...options,
  })
}

export function createNoStreamingModel(
  options?: Parameters<typeof createChatModel>[0] // 获取 createChatModel 函数的参数类型
) {
  return createChatModel({
    ...options,
    disableStreaming: true, // 禁用流式输出
    tags: ['nostream'], // 添加标签，方便区分
  })
}

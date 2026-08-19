// src/ai/model.ts
import { ChatOpenAI } from '@langchain/openai'

export function createChatModel() {
  return new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL,
    // 使用 Responses API
    useResponsesApi: true,
    modelKwargs: {
      // 注意，咱自己做的事儿，别让它看见，不往里面存
      store: false,
    },
  })
}

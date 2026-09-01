// 一句话生成大屏
import { AIMessage } from '@langchain/core/messages'

export function handlePageTask() {
  return {
    messages: [new AIMessage('接到任务：根据用户的意图，生成大屏。')],
  }
}

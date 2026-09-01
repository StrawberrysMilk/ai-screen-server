// 修改大屏字典
import { AIMessage } from '@langchain/core/messages'

export function handleEditTask() {
  return {
    messages: [new AIMessage('接到任务：根据用户的意图，修改大屏的字典。')],
  }
}

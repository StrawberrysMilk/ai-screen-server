import { BaseMessage } from '@langchain/core/messages'

export function getLastUserMessage(messages: BaseMessage[]) {
  return messages.findLast(message => message.type === 'human')
}

import { MessagesValue, StateSchema } from '@langchain/langgraph'

export const State = new StateSchema({
  messages: MessagesValue,
})

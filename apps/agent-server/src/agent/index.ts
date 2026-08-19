import { START, END, StateGraph } from '@langchain/langgraph'
import { State } from './state.js'
import { createChatModel } from '../ai/model.js'

const answerMessage = async state => {
  const model = createChatModel()
  const result = await model.invoke(state.messages)
  return {
    messages: [result],
  }
}

const builder = new StateGraph(State)
  .addNode('answerMessage', answerMessage)
  .addEdge(START, 'answerMessage')
  .addEdge('answerMessage', END)

export const graph = builder.compile()

graph.name = 'ScreenDesignAgent'

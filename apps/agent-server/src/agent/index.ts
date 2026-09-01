import { START, END, StateGraph } from '@langchain/langgraph'
import { State } from './state.js'
import {
  handleMessageTask,
  handleEditTask,
  handlePageTask,
} from './task-nodes/index.js'
import { classifyTask } from './classification.js'

const builder = new StateGraph(State)
  .addNode('classifyTask', classifyTask)
  .addNode('handleMessageTask', handleMessageTask)
  .addNode('handleEditTask', handleEditTask)
  .addNode('handlePageTask', handlePageTask)
  .addEdge(START, 'classifyTask')
  .addConditionalEdges('classifyTask', state => state.classification.task, {
    message: 'handleMessageTask',
    edit: 'handleEditTask',
    page: 'handlePageTask',
  })
  .addEdge('handleMessageTask', END)
  .addEdge('handleEditTask', END)
  .addEdge('handlePageTask', END)

export const graph = builder.compile()

graph.name = 'ScreenDesignAgent'

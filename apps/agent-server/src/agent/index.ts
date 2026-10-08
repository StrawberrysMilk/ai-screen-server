import { START, END, StateGraph } from '@langchain/langgraph'
import { State } from './state.js'
import {
  handleMessageTask,
  handleEditTask,
  handlePageTask,
  handleEditResult,
  handlePlanEdit,
} from './task-nodes/index.js'
import { classifyTask } from './classification.js'

const builder = new StateGraph(State)
  .addNode('classifyTask', classifyTask)
  .addNode('handleMessageTask', handleMessageTask)
  .addNode('handlePageTask', handlePageTask)
  .addNode('handleEditTask', handleEditTask)
  .addNode('handlePlanEdit', handlePlanEdit)
  .addNode('handleEditResult', handleEditResult)
  .addEdge(START, 'classifyTask')
  .addConditionalEdges('classifyTask', state => state.classification.task, {
    message: 'handleMessageTask',
    page: 'handlePageTask',
    edit: 'handlePlanEdit',
  })
  .addConditionalEdges('handlePlanEdit', state => {
    return state.editPlan.length > 0 ? 'handleEditTask' : END
  })
  .addEdge('handleMessageTask', END)
  .addEdge('handlePageTask', END)
  .addEdge('handleEditTask', 'handleEditResult')
  .addEdge('handleEditResult', END)

export const graph = builder.compile()

graph.name = 'ScreenDesignAgent'

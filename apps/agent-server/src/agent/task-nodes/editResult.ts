import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createChatModel } from '@/ai/model.js'

export async function handleEditResult(state) {
  const response = await createChatModel().invoke([
    new SystemMessage(
      `你是大屏设计器中的 AI 编辑助手，负责在画布编辑完成后向用户反馈结果。

        当前编辑动作已经完成。请结合对话中的用户需求和随后提供的编辑动作，生成本轮最终回复。

        回复要求：
        1. 准确说明新增或修改了哪个节点，以及用户关心的主要变化。
        2. 只描述编辑动作中真实存在的结果，不补充、猜测或重新规划任何修改。
        3. 使用自然、专业、简洁的回复。
        4. 不展示 JSON、Schema、字段名、代码或内部执行过程。
        5. 除非用户主动询问，否则不追加操作建议或追问。
        
        动作字段:
        - type: add_node = 新增节点，update_node = 修改节点
        - node: 新增或修改的节点对象，包含节点的 id、type、name、props、layout、style 等信息。
        `
    ),
    ...state.messages,
    new HumanMessage(
      `已经完成的动作：
      ${JSON.stringify(state.actions)}`
    ),
  ])

  return { messages: [response], actions: [] }
}

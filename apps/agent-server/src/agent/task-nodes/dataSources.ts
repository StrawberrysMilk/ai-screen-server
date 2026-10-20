import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createNonStreamingModel } from '@/ai/model.ts'

export async function generateDataSource(prompt: string, dataSourceJsonSchema) {
  const model = createNonStreamingModel().withStructuredOutput(
    dataSourceJsonSchema,
    {
      name: 'data_source',
      method: 'jsonSchema',
    }
  )

  let data
  try {
    data = await model.invoke([
      new SystemMessage(`
        你是大屏设计器的数据源生成助手。
        根据用户要求生成完整数据源，字段和类型遵守提供的 JSON Schema。

        通用规则：
        - name 使用当前任务要求中的展示名称，沿用用户语言，可以是中文。
        - id 是必填占位字段，填写任意字符串即可；程序会用 UUID 覆盖。

        静态数据源规则：
        - type 为 static，只填写 type、id、name、data；data 是对象数组。
        - 只有 data 中每个对象的字段名必须使用当前任务已经归纳好的英文字段名，不能使用中文，不能随意改名，也不能返回空对象。
        - 字段名统一使用有业务含义的英文 lowerCamelCase，例如 month、salesAmount、isWarning。
        - 只转换字段名；任务中的名称、分类等文本值必须原样保留，不能翻译、缩写或改写。
        - 数字、布尔值和 null 必须保持原本的 JSON 类型，不能全部转换成字符串。
        - 只能生成用户提供的数据；只有用户明确允许生成示例数据时，才可以补充示例值。
        - 同一数据集中的某条记录没有明确提供某个字段值时，该值必须为 null，不能推断为 false、0、空字符串或其他默认值。

        API 数据源规则：
        - type 为 api。
        - data 是接口请求完成前使用的初始值，可以是任意 JSON 类型。用户提供了默认值时必须原样保留；用户没有提供时返回 null，不能猜测为数组或对象。
        - url 原样使用当前任务给出的接口地址，不能猜测或补造。
        - method 未指定时使用 get。
        - params、responsePath、interval 只有当前任务提供时才返回，不能猜测。
        - params 保持原始 JSON 类型。
      `),
      new HumanMessage(prompt),
    ])
  } catch (error) {
    const details = error as {
      name?: unknown
      message?: unknown
      stack?: unknown
    }
    console.error('[DEBUG-DATASOURCE-ERROR]', {
      name: details?.name,
      message: details?.message,
      stack: details?.stack,
    })
    throw error
  }

  return { ...data, id: crypto.randomUUID() }
}

export async function updateDataSource(
  prompt: string,
  currentDataSource: Record<string, unknown>,
  dataSourceJsonSchema
) {
  const model = createNonStreamingModel().withStructuredOutput(
    dataSourceJsonSchema,
    {
      name: 'data_source',
      method: 'jsonSchema',
    }
  )

  const data = await model.invoke([
    new SystemMessage(`
      你是大屏设计器的数据源修改助手。
      根据用户要求返回修改后的完整数据源，字段和类型遵守提供的 JSON Schema。
      id 是必填占位字段，填写任意字符串即可；程序会保留原来的 id。
      type 保持原来的值；没有要求修改的字段和数据必须原样保留。
      如果修改 data，必须保留未要求修改的记录和字段。
      如果修改 params，必须保留未要求修改的参数。
      静态数据的字段名保持英文 lowerCamelCase；文本值保持用户原文，数字、布尔值和 null 保持原本的 JSON 类型。
      不要猜测 API 地址、默认数据或其他未提供的配置。

      当前数据源：${JSON.stringify(currentDataSource, null, 2)}
    `),
    new HumanMessage(prompt),
  ])

  return {
    ...data,
    id: currentDataSource.id,
  }
}

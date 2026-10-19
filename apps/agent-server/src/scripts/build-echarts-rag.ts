import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeHTML } from 'entities'
import { createEmbeddingModel } from '../ai/model.ts'
import { writeKnowledgeDatabase } from '../rag/database.ts'

// 这地方存的是咱从 github 上面拉下来的 echarts 的 json 配置
const ECHARTS_DOCUMENT_DIR = fileURLToPath(
  new URL('../../resources/echarts/', import.meta.url)
)

// 读取这个目录的所有文件名
const filenames = await readdir(ECHARTS_DOCUMENT_DIR)

const chunks = []

// 逐个读取文档，再汇总成同一个知识片段数组。
for (const filename of filenames) {
  const document = JSON.parse(
    await readFile(join(ECHARTS_DOCUMENT_DIR, filename), 'utf8')
  )

  // option.series-bar.json 转成 series.bar，option.dataset.json 转成 dataset。
  const pathPrefix = filename
    .replace(/^option\./, '')
    .replace(/\.json$/, '')
    .replaceAll('-', '.')

  const documentChunks = buildChunks(document, pathPrefix)

  chunks.push(...documentChunks)
}

// 创建 Embedding 客模型。
const embeddings = createEmbeddingModel()

const vectors = []

// 每批 10 条只是在控制单次 Embedding 请求的大小，因为 qwen 一次最多 10 条
for (let start = 0; start < chunks.length; start += 10) {
  const batch = chunks.slice(start, start + 10)

  // 路径也参与向量化，帮助检索区分名称相似但位置不同的配置。
  const texts = batch.map(
    chunk => `ECharts 配置 ${chunk.path}\n${chunk.description}`
  )
  // 使用向量模型向量化
  vectors.push(...(await embeddings.embedDocuments(texts)))
}

// 把 chunks 和向量写到库里面去
writeKnowledgeDatabase(chunks, vectors)

function cleanDescription(html: string) {
  return (
    decodeHTML(
      html
        // script、style、iframe 的内部文本不是配置说明，整体删除。
        .replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        // 段落、列表和代码块结束时保留换行，避免文字全部粘在一起。
        .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|pre|h[1-6])>/gi, '\n')
        // 给列表项补上短横线，使纯文本仍能看出列表结构。
        .replace(/<li\b[^>]*>/gi, '- ')
        // 最后删除剩余 HTML 标签。
        .replace(/<[^>]*>/g, '')
    )
      // decodeHTML 已还原 &lt;、&#39; 等实体，接着统一空格和连续空行。
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim()
  )
}

// 把 echarts 官方 JSON 转换成可以生成向量的 chubk
function buildChunks(
  document: Record<string, { desc?: string }>,
  pathPrefix: string
) {
  const chunks = []

  for (const [key, entry] of Object.entries(document)) {
    const description = cleanDescription(entry.desc)
    // 单文件中的 key 只有 barWidth、source 等相对路径，入库前补全前缀。
    const path = `${pathPrefix}.${key}`
    chunks.push({
      id: randomUUID(),
      path,
      description,
    })
  }

  return chunks
}

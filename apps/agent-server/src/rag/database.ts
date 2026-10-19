import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { fileURLToPath } from 'node:url'

export const RAG_DB_PATH = fileURLToPath(
  new URL('../../data/rag.sqlite', import.meta.url)
)

export function writeKnowledgeDatabase(chunks, vectors) {
  // 使用第一条向量确定向量表的维度。
  const dimensions = vectors[0].length
  // 文件不存在时，better-sqlite3 会自动创建数据库文件。
  const db = new Database(RAG_DB_PATH)

  try {
    // 加载扩展后，SQLite 才认识 vec0 向量表。
    sqliteVec.load(db)

    db.transaction(() => {
      db.exec(`
        CREATE TABLE chunks (
          rowid INTEGER PRIMARY KEY,
          chunk_id TEXT NOT NULL UNIQUE,
          path TEXT NOT NULL,
          description TEXT NOT NULL
        );
        -- dataset.source
        CREATE VIRTUAL TABLE chunk_vectors USING vec0(
          embedding float[${dimensions}] distance_metric=cosine
        );
      `)

      const insertChunk = db.prepare(`
        INSERT INTO chunks(chunk_id, path, description)
        VALUES (?, ?, ?)
      `)
      const insertVector = db.prepare(
        'INSERT INTO chunk_vectors(rowid, embedding) VALUES (?, ?)'
      )

      chunks.forEach((chunk, index) => {
        // 先写正文，取得 SQLite 自动生成的 rowid。
        const result = insertChunk.run(chunk.id, chunk.path, chunk.description)

        // sqlite-vec 要求 rowid 使用 SQLite INTEGER，BigInt 可以保证正确绑定类型。
        insertVector.run(
          BigInt(result.lastInsertRowid),
          new Float32Array(vectors[index])
        )
      })
    })()
  } finally {
    db.close()
  }
}

export function searchKnowledgeDatabase(vector: number[], topK: number) {
  // 以只读方式打开已经生成好的 SQLite 知识库。
  const db = new Database(RAG_DB_PATH, {
    readonly: true,
  })

  try {
    // 当前连接需要加载 sqlite-vec，才能执行 vec0 的向量查询。
    sqliteVec.load(db)

    return db
      .prepare(
        `
          SELECT c.chunk_id AS id, c.path, c.description,
            v.distance
          FROM chunk_vectors v
          JOIN chunks c ON c.rowid = v.rowid
          WHERE v.embedding MATCH ? AND k = ?
          ORDER BY v.distance
        `
      )
      .all(new Float32Array(vector), topK)
  } finally {
    db.close()
  }
}

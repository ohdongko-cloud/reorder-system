import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
  throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.')
}

const sql = neon(process.env.DATABASE_URL ?? 'postgresql://localhost/dev')
export default sql

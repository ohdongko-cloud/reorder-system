import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'

const getSecret = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET ?? 'dev-secret-please-set-in-production')

// Simple rate limit: 10 attempts per IP per minute
const attempts = new Map<string, { count: number; resetAt: number }>()
function checkLimit(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!checkLimit(ip)) {
    return NextResponse.json({ error: '잠시 후 다시 시도하세요.' }, { status: 429 })
  }

  const { password } = await req.json()

  if (!password || password !== process.env.AUTH_PASSWORD) {
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  const token = await new SignJWT({ sub: 'user' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())

  const res = NextResponse.json({ ok: true })
  res.cookies.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return res
}

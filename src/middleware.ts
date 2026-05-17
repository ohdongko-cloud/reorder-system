import { jwtVerify } from 'jose'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC = ['/login', '/api/auth']

const getSecret = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET ?? 'dev-secret-please-set-in-production')

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()

  // Dev: skip auth when no password configured
  if (process.env.NODE_ENV !== 'production' && !process.env.AUTH_PASSWORD) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth-token')?.value
  if (!token) return redirectToLogin(request)

  try {
    await jwtVerify(token, getSecret())
    return NextResponse.next()
  } catch {
    return redirectToLogin(request)
  }
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', req.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/reorder/:path*', '/api/((?!auth).*)'],
}

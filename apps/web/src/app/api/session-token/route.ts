import { auth } from '@/auth'
import { Octokit } from '@octokit/rest'
import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const octokit = new Octokit({ auth: session.accessToken })
  const { data: githubUser } = await octokit.users.getAuthenticated()

  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)
  const token = await new SignJWT({
    userId: session.user.id,
    userLogin: githubUser.login,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)

  return NextResponse.json({ token })
}

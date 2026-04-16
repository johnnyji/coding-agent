import { auth } from '@/auth'
import { Octokit } from '@octokit/rest'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const octokit = new Octokit({ auth: session.accessToken })
  const { data } = await octokit.repos.listForAuthenticatedUser({
    per_page: 100,
    sort: 'updated',
  })

  const repos = data.map((repo) => ({
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
  }))

  return NextResponse.json({ repos })
}

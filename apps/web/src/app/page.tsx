import { auth, signIn } from '@/auth'
import { HomeContent } from '@/components/HomeContent'

export default async function Home() {
  const session = await auth()

  if (!session) {
    return (
      <main>
        <h1>Coding Agent</h1>
        <form
          action={async () => {
            'use server'
            await signIn('github')
          }}
        >
          <button type="submit">Sign in with GitHub</button>
        </form>
      </main>
    )
  }

  return (
    <main>
      <h1>Coding Agent</h1>
      <HomeContent />
    </main>
  )
}

import { auth, signIn, signOut } from '@/auth'
import { HomeContent } from '@/components/HomeContent'

export default async function Home() {
  const session = await auth()

  if (!session) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Coding Agent</h1>
        <form
          action={async () => {
            'use server'
            await signIn('github')
          }}
        >
          <button
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
            type="submit"
          >
            Sign in with GitHub
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-bold">Coding Agent</h1>
        <form
          action={async () => {
            'use server'
            await signOut()
          }}
        >
          <button
            className="rounded-md px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </header>
      <div className="flex-1 overflow-hidden">
        <HomeContent />
      </div>
    </main>
  )
}

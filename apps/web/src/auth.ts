import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import PostgresAdapter from '@auth/pg-adapter'
import { Pool } from 'pg'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      const result = await pool.query(
        'SELECT access_token FROM accounts WHERE "userId" = $1 AND provider = $2',
        [user.id, 'github'],
      )
      return {
        ...session,
        accessToken: (result.rows[0]?.access_token as string | undefined),
      }
    },
  },
})

'use client'

import { useEffect, useState } from 'react'

interface Repo {
  owner: string
  name: string
  fullName: string
  private: boolean
}

interface RepoSelectorProps {
  onSelect: (repo: { repoOwner: string; repoName: string }) => void
}

export function RepoSelector({ onSelect }: RepoSelectorProps) {
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/repos')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load repositories')
        return res.json() as Promise<{ repos: Repo[] }>
      })
      .then((data) => {
        setRepos(data.repos)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      })
  }, [])

  if (loading) return <p>Loading repositories...</p>
  if (error) return <p>Error: {error}</p>

  return (
    <select
      defaultValue=""
      onChange={(e) => {
        const repo = repos.find((r) => r.fullName === e.target.value)
        if (repo) onSelect({ repoOwner: repo.owner, repoName: repo.name })
      }}
    >
      <option value="" disabled>
        Select a repository
      </option>
      {repos.map((repo) => (
        <option key={repo.fullName} value={repo.fullName}>
          {repo.fullName} {repo.private ? '(private)' : ''}
        </option>
      ))}
    </select>
  )
}

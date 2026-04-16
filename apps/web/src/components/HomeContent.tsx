'use client'

import { useState } from 'react'
import { RepoSelector } from './RepoSelector'

export function HomeContent() {
  const [selectedRepo, setSelectedRepo] = useState<{
    repoOwner: string
    repoName: string
  } | null>(null)

  return (
    <>
      <RepoSelector onSelect={setSelectedRepo} />
      {selectedRepo && <div>Chat goes here</div>}
    </>
  )
}

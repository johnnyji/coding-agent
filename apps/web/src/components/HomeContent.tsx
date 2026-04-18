'use client'

import { useState } from 'react'
import { ChatInterface } from './ChatInterface'
import { RepoSelector } from './RepoSelector'

export function HomeContent() {
  const [selectedRepo, setSelectedRepo] = useState<{
    repoOwner: string
    repoName: string
  } | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <RepoSelector onSelect={setSelectedRepo} />
      </div>
      {selectedRepo && (
        <div className="flex-1 overflow-hidden">
          <ChatInterface repoName={selectedRepo.repoName} repoOwner={selectedRepo.repoOwner} />
        </div>
      )}
    </div>
  )
}

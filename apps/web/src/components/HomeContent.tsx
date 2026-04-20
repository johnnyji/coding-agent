'use client'

import { ChatInterface } from './ChatInterface'

export function HomeContent() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <ChatInterface repoName="distru" repoOwner="DistruApp" />
      </div>
    </div>
  )
}

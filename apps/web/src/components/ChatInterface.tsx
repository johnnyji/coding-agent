'use client'

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input'
import { Button } from '@/components/ui/button'
import { useOrchestrator, type OrchestratorStatus } from '@/hooks/useOrchestrator'
import { useState } from 'react'

interface ChatInterfaceProps {
  repoOwner: string
  repoName: string
}

function StatusBadge({ status }: { status: OrchestratorStatus }) {
  const styles: Record<OrchestratorStatus, string> = {
    idle: 'bg-gray-100 text-gray-600',
    running: 'bg-blue-100 text-blue-700',
    waiting: 'bg-yellow-100 text-yellow-700',
    finished: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  }
  const labels: Record<OrchestratorStatus, string> = {
    idle: 'idle',
    running: 'running',
    waiting: 'waiting for input',
    finished: 'finished',
    error: 'error',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

export function ChatInterface({ repoOwner, repoName }: ChatInterfaceProps) {
  const { threadId, messages, status, prUrl, startError, startSession, sendMessage } = useOrchestrator()
  const [featureRequest, setFeatureRequest] = useState('')

  const isStarted = threadId !== null
  const inputEnabled = !isStarted || status === 'waiting'

  const handleStart = () => {
    if (!featureRequest.trim()) return
    void startSession(repoOwner, repoName, featureRequest)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="font-medium">
          {repoOwner}/{repoName}
        </span>
        <StatusBadge status={status} />
      </div>

      {/* PR link banner */}
      {prUrl && (
        <div className="border-b bg-green-50 px-4 py-3 text-sm text-green-800">
          PR opened:{' '}
          <a
            className="underline"
            href={prUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {prUrl}
          </a>
        </div>
      )}

      {/* Content area */}
      {!isStarted ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <h2 className="text-xl font-semibold">Describe the feature</h2>
          <textarea
            className="h-32 w-full max-w-lg resize-none rounded-md border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            onChange={(e) => setFeatureRequest(e.target.value)}
            placeholder="e.g. Add bulk CSV export to the orders table"
            value={featureRequest}
          />
          {startError && (
            <p className="max-w-lg text-sm text-red-600">{startError}</p>
          )}
          <Button
            disabled={!featureRequest.trim() || status === 'running'}
            onClick={handleStart}
          >
            {status === 'running' ? 'Starting…' : 'Start'}
          </Button>
        </div>
      ) : (
        <>
          <Conversation className="flex-1">
            <ConversationContent>
              {messages.map((msg, i) =>
                msg.role === 'system' ? (
                  <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700" key={i}>
                    {msg.content}
                  </div>
                ) : (
                  <Message from={msg.role === 'user' ? 'user' : 'assistant'} key={i}>
                    <MessageContent>
                      <MessageResponse isAnimating={false}>{msg.content}</MessageResponse>
                    </MessageContent>
                  </Message>
                ),
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          {status !== 'finished' && (
            <PromptInput
              className="border-t"
              onSubmit={({ text }) => {
                if (text.trim() && status === 'waiting') void sendMessage(text)
              }}
            >
              <PromptInputTextarea
                disabled={!inputEnabled}
                placeholder={
                  status === 'waiting'
                    ? 'Answer the question above…'
                    : 'Waiting for agent…'
                }
              />
              <PromptInputFooter>
                <div />
                <PromptInputSubmit disabled={!inputEnabled} />
              </PromptInputFooter>
            </PromptInput>
          )}
        </>
      )}
    </div>
  )
}

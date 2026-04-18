'use client'

import { createParser } from 'eventsource-parser'
import { useCallback, useEffect, useRef, useState } from 'react'

export type OrchestratorStatus = 'idle' | 'running' | 'waiting' | 'finished' | 'error'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface SseEvent {
  type: 'message' | 'status' | 'error' | 'finish'
  content?: string
  prUrl?: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

async function getSessionToken(): Promise<string> {
  const res = await fetch('/api/session-token')
  if (!res.ok) throw new Error('Failed to get session token')
  const { token } = (await res.json()) as { token: string }
  return token
}

export function useOrchestrator() {
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<OrchestratorStatus>('idle')
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tokenRef = useRef<string | null>(null)
  const threadIdRef = useRef<string | null>(null)

  // Keep ref in sync with state for use inside callbacks
  useEffect(() => {
    threadIdRef.current = threadId
  }, [threadId])

  const openStream = useCallback(async (id: string) => {
    if (!tokenRef.current) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsStreaming(true)

    let receivedFinish = false

    const parser = createParser({
      onEvent(evt) {
        try {
          const data = JSON.parse(evt.data) as SseEvent

          if (data.type === 'message' && data.content) {
            setMessages((prev) => [...prev, { role: 'assistant', content: data.content! }])
          } else if (data.type === 'status' && data.content) {
            const validStatuses: OrchestratorStatus[] = ['running', 'waiting', 'finished', 'error']
            if (validStatuses.includes(data.content as OrchestratorStatus)) {
              setStatus(data.content as OrchestratorStatus)
            }
          } else if (data.type === 'error') {
            setStatus('error')
          } else if (data.type === 'finish') {
            receivedFinish = true
            setStatus('finished')
            if (data.prUrl) setPrUrl(data.prUrl)
          }
        } catch {
          // ignore malformed events
        }
      },
    })

    try {
      const res = await fetch(`${API_URL}/api/threads/${id}/stream`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        setStatus('error')
        setIsStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parser.feed(decoder.decode(value, { stream: true }))
      }

      // Stream ended without a finish event — reconnect
      if (!receivedFinish && !controller.signal.aborted) {
        reconnectRef.current = setTimeout(() => {
          void openStream(id)
        }, 2000)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      // Network error — reconnect
      reconnectRef.current = setTimeout(() => {
        void openStream(id)
      }, 2000)
    } finally {
      setIsStreaming(false)
    }
  }, [])

  const startSession = useCallback(
    async (repoOwner: string, repoName: string, featureRequest: string) => {
      setMessages([{ role: 'user', content: featureRequest }])
      setStatus('running')
      setPrUrl(null)

      const token = await getSessionToken()
      tokenRef.current = token

      const res = await fetch(`${API_URL}/api/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ repoOwner, repoName, featureRequest }),
      })

      if (!res.ok) {
        setStatus('error')
        throw new Error('Failed to start session')
      }

      const { threadId: id } = (await res.json()) as { threadId: string }
      setThreadId(id)
      void openStream(id)
    },
    [openStream],
  )

  const sendMessage = useCallback(
    async (message: string) => {
      const id = threadIdRef.current
      if (!id) return

      setMessages((prev) => [...prev, { role: 'user', content: message }])
      setStatus('running')

      const token = await getSessionToken()
      tokenRef.current = token

      const res = await fetch(`${API_URL}/api/threads/${id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      })

      if (!res.ok) throw new Error('Failed to send message')

      void openStream(id)
    },
    [openStream],
  )

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
    }
  }, [])

  return { threadId, messages, status, prUrl, isStreaming, startSession, sendMessage }
}

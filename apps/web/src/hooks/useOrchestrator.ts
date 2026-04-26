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

// Proxy all API calls through the Next.js server to avoid Chrome's Private
// Network Access (PNA) restriction (public HTTPS → localhost blocked).
const API_URL = '/api/proxy'

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
  const [startError, setStartError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tokenRef = useRef<string | null>(null)
  const threadIdRef = useRef<string | null>(null)

  // Cursor for duplicate-free reconnects.
  //
  // The server buffers every event emitted during a thread's lifetime and
  // replays them from a given index on each (re)connect. Without a cursor it
  // would always replay from index 0, duplicating every message the client had
  // already received. We track the total number of events received here and
  // send it as `?from=` on every openStream call so the server only replays
  // what we haven't seen yet. Reset to 0 when a new session starts.
  const eventCountRef = useRef(0)

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
        // Increment the cursor for every event the server sends, regardless of
        // type. This keeps eventCountRef in sync with the server-side buffer
        // index so that reconnects request exactly the right starting position.
        eventCountRef.current++

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
            if (data.content) {
              setMessages((prev) => [...prev, { role: 'system', content: data.content! }])
            }
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
      // Pass the cursor so the server replays only events we haven't seen yet.
      // On initial connect eventCountRef.current is 0 (full replay of any
      // buffered events). On reconnect it reflects how many events we received
      // before the drop, so we get only the missed ones — no duplicates.
      const res = await fetch(`${API_URL}/threads/${id}/stream?from=${eventCountRef.current}`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        setIsStreaming(false)
        // Permanent client errors (auth/not found) — don't reconnect
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          setStatus('error')
          return
        }
        // Transient error (502, 524, etc.) — reconnect after delay
        reconnectRef.current = setTimeout(() => {
          void openStream(id)
        }, 2000)
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
      setStartError(null)
      setMessages([{ role: 'user', content: featureRequest }])
      setPrUrl(null)

      let token: string
      try {
        token = await getSessionToken()
      } catch {
        setStatus('error')
        setStartError('Failed to get session token. Please refresh and try again.')
        return
      }
      tokenRef.current = token
      // New session — reset the event cursor so the server replays the full
      // buffer from index 0 on initial connect.
      eventCountRef.current = 0

      // Only set running after we have a valid token and are about to hit the API
      setStatus('running')

      const res = await fetch(`${API_URL}/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ repoOwner, repoName, featureRequest }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        const message = body.error ?? 'Failed to start session. Please try again.'
        setStatus('error')
        setStartError(message)
        return
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

      const res = await fetch(`${API_URL}/threads/${id}/messages`, {
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

  return { threadId, messages, status, prUrl, isStreaming, startError, startSession, sendMessage }
}

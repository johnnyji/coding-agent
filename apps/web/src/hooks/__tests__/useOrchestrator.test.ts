import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrchestrator } from '../useOrchestrator'

// Mock eventsource-parser v3 API
vi.mock('eventsource-parser', () => ({
  createParser: (callbacks: { onEvent?: (event: { data: string }) => void }) => ({
    feed: (chunk: string) => {
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          callbacks.onEvent?.({ data: line.slice(6) })
        }
      }
    },
    reset: () => undefined,
  }),
}))

const makeReadableStream = (chunks: string[]) => {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]))
      } else {
        controller.close()
      }
    },
  })
}

describe('useOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useOrchestrator())
    expect(result.current.status).toBe('idle')
    expect(result.current.threadId).toBeNull()
    expect(result.current.messages).toEqual([])
    expect(result.current.prUrl).toBeNull()
  })

  it('startSession posts to /api/threads and opens SSE stream', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'test-token' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ threadId: 'thread-123' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        body: makeReadableStream([
          `data: ${JSON.stringify({ type: 'finish', prUrl: 'https://github.com/pr/1' })}\n`,
        ]),
      } as unknown as Response)

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useOrchestrator())

    await act(async () => {
      await result.current.startSession('owner', 'repo', 'Add CSV export')
    })

    await waitFor(() => expect(result.current.status).toBe('finished'))

    expect(result.current.threadId).toBe('thread-123')
    expect(result.current.prUrl).toBe('https://github.com/pr/1')
    expect(result.current.messages[0]).toEqual({
      role: 'user',
      content: 'Add CSV export',
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/session-token')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/threads'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('appends assistant messages from SSE events', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'tok' }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ threadId: 'th-1' }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          body: makeReadableStream([
            `data: ${JSON.stringify({ type: 'message', content: 'Hello from agent' })}\n`,
            `data: ${JSON.stringify({ type: 'finish', prUrl: 'https://pr' })}\n`,
          ]),
        } as unknown as Response),
    )

    const { result } = renderHook(() => useOrchestrator())

    await act(async () => {
      await result.current.startSession('o', 'r', 'feature')
    })

    await waitFor(() => expect(result.current.status).toBe('finished'))

    expect(result.current.messages).toContainEqual({
      role: 'assistant',
      content: 'Hello from agent',
    })
  })

  it('sets status to error on non-ok stream response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 't' }) } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ threadId: 'th-2' }),
        } as unknown as Response)
        .mockResolvedValueOnce({ ok: false, body: null } as unknown as Response),
    )

    const { result } = renderHook(() => useOrchestrator())

    await act(async () => {
      await result.current.startSession('o', 'r', 'feat')
    })

    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})

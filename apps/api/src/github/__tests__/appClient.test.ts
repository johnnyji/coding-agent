import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRepoInstallation = vi.fn()
const mockOctokitInstances: { authStrategy?: unknown; auth?: unknown }[] = []

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation((opts: { authStrategy?: unknown; auth?: unknown }) => {
    mockOctokitInstances.push(opts)
    return {
      apps: {
        getRepoInstallation: mockGetRepoInstallation,
      },
    }
  }),
}))

vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn().mockReturnValue('mock-auth-strategy'),
}))

describe('getInstallationOctokit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOctokitInstances.length = 0
    process.env.GITHUB_APP_ID = 'test-app-id'
    process.env.GITHUB_APP_PRIVATE_KEY = 'test-private-key'
    mockGetRepoInstallation.mockResolvedValue({ data: { id: 12345 } })
  })

  it('creates an app-level Octokit with app credentials', async () => {
    const { getInstallationOctokit } = await import('../appClient.js')
    await getInstallationOctokit('owner', 'repo')

    expect(mockOctokitInstances[0]).toMatchObject({
      auth: {
        appId: 'test-app-id',
        privateKey: 'test-private-key',
      },
    })
  })

  it('looks up the installation for the given repo', async () => {
    const { getInstallationOctokit } = await import('../appClient.js')
    await getInstallationOctokit('myorg', 'myrepo')

    expect(mockGetRepoInstallation).toHaveBeenCalledWith({
      owner: 'myorg',
      repo: 'myrepo',
    })
  })

  it('creates an installation-level Octokit with the installation ID', async () => {
    const { getInstallationOctokit } = await import('../appClient.js')
    await getInstallationOctokit('owner', 'repo')

    expect(mockOctokitInstances[1]).toMatchObject({
      auth: {
        appId: 'test-app-id',
        privateKey: 'test-private-key',
        installationId: 12345,
      },
    })
  })

  it('returns the installation-level Octokit instance', async () => {
    const { getInstallationOctokit } = await import('../appClient.js')
    const result = await getInstallationOctokit('owner', 'repo')

    expect(result).toBeDefined()
    expect(result).toHaveProperty('apps')
  })
})

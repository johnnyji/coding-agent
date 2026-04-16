import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'

export async function getInstallationOctokit(
  repoOwner: string,
  repoName: string,
): Promise<Octokit> {
  const appId = process.env.GITHUB_APP_ID!
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY!

  // App-level Octokit to look up the installation ID
  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
  })

  const { data: installation } = await appOctokit.apps.getRepoInstallation({
    owner: repoOwner,
    repo: repoName,
  })

  // Installation-level Octokit authenticated as the GitHub App installation
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId: installation.id },
  })
}

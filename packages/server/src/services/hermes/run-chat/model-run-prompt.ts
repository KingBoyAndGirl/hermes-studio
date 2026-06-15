import { issueModelRunJwt, type AuthenticatedUser } from '../../../middleware/user-auth'

export async function buildModelRunAuthPrompt(user: AuthenticatedUser | undefined, profile: string): Promise<string[]> {
  if (!user) return []
  const token = await issueModelRunJwt(user)
  return [
    `[Current Hermes profile: ${profile}]`,
    `[Current Hermes Web UI model run token: ${token}]`,
    'When calling Hermes Web UI MCP tools, pass the current Hermes profile as the profile argument and the current Hermes Web UI model run token as the token argument.',
    'When calling Hermes Web UI HTTP endpoints from tools or skills, use Authorization: Bearer <current model run token> and X-Hermes-Profile: <current Hermes profile>.',
    'The current Hermes Web UI model run token expires in 1 hour.',
  ]
}

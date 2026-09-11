import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@dogfood/auth'

export const { GET, POST } = toNextJsHandler(auth)

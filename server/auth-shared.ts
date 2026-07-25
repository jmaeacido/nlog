export class AuthError extends Error {
  status: number

  constructor(message: string, status = 401) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

export interface AuthenticatedUser {
  id: string
  email: string
  name: string | null
}

export interface AppAuthUser extends AuthenticatedUser {
  provider: 'microsoft' | 'password'
}

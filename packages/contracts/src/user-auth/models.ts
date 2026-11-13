export type UserRole = 'super-admin' | 'admin' | 'user'
/** Cognito access token is transported in an HTTP-only cookie. */
export type CognitoAccessToken = string & { readonly __brand: 'CognitoAccessToken' }

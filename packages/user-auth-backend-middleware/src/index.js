import { JwtVerifier } from 'aws-jwt-verify'
import { validateCognitoJwtFields } from 'aws-jwt-verify/cognito-verifier'
import { SimpleJwksCache } from 'aws-jwt-verify/jwk'
function config() {
  const poolId = process.env.COGNITO_USER_POOL_ID ?? 'us-east-1_test'
  const region = process.env.AWS_DEFAULT_REGION ?? 'us-east-1'
  const issuer =
    process.env.COGNITO_ISSUER ?? `https://cognito-idp.${region}.amazonaws.com/${poolId}`
  return {
    issuer,
    jwksUri: process.env.COGNITO_JWKS_URI ?? `${issuer}/.well-known/jwks.json`,
    clientId: process.env.COGNITO_CLIENT_ID ?? 'test',
    adminGroup: process.env.COGNITO_ADMIN_GROUP_NAME ?? 'AdminGroup',
    superGroup: process.env.COGNITO_SUPERADMIN_GROUP_NAME ?? 'SuperAdminGroup',
  }
}
let verifiers
function makeVerifiers() {
  const env = config()
  const jwksCache = new SimpleJwksCache({
    fetcher: {
      fetch: async (uri) => {
        const response = await fetch(uri, { signal: AbortSignal.timeout(5000) })
        if (!response.ok) throw new Error(`Cognito JWKS returned ${response.status}`)
        return response.arrayBuffer()
      },
    },
  })
  const access = JwtVerifier.create(
    {
      issuer: env.issuer,
      audience: null,
      jwksUri: env.jwksUri,
      customJwtCheck: ({ payload }) =>
        validateCognitoJwtFields(payload, { tokenUse: 'access', clientId: env.clientId }),
    },
    { jwksCache },
  )
  const id = JwtVerifier.create(
    {
      issuer: env.issuer,
      audience: null,
      jwksUri: env.jwksUri,
      customJwtCheck: ({ payload }) =>
        validateCognitoJwtFields(payload, { tokenUse: 'id', clientId: env.clientId }),
    },
    { jwksCache },
  )
  return { access, id, env }
}
function getVerifiers() {
  return (verifiers ??= makeVerifiers())
}
export function readCookie(header, name) {
  return header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}
export const readAccessToken = (header) => readCookie(header, 'relay_access')
export async function verifyCognitoTokens(accessToken, idToken) {
  const { access, id, env } = getVerifiers()
  const [accessClaims, idClaims] = await Promise.all([
    access.verify(accessToken),
    id.verify(idToken),
  ])
  if (
    typeof accessClaims.sub !== 'string' ||
    !accessClaims.sub ||
    accessClaims.sub !== idClaims.sub ||
    typeof idClaims.email !== 'string' ||
    !idClaims.email ||
    (typeof idClaims.email_verified !== 'boolean' &&
      idClaims.email_verified !== 'true' &&
      idClaims.email_verified !== 'false')
  ) {
    throw new Error('Cognito identity claims are invalid.')
  }
  const groups = Array.isArray(accessClaims['cognito:groups']) ? accessClaims['cognito:groups'] : []
  const role = groups.includes(env.superGroup)
    ? 'super-admin'
    : groups.includes(env.adminGroup)
      ? 'admin'
      : 'user'
  return {
    sub: accessClaims.sub,
    email: idClaims.email,
    emailVerified: idClaims.email_verified === true || idClaims.email_verified === 'true',
    role,
  }
}
function middleware(requiredRole) {
  return async (req, res, next) => {
    const header = req.header('cookie')
    const access = readAccessToken(header)
    const id = readCookie(header, 'relay_id')
    if (!access || !id) {
      res
        .status(401)
        .json({
          ok: false,
          error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
        })
      return
    }
    try {
      req.user = await verifyCognitoTokens(access, id)
    } catch {
      res
        .status(401)
        .json({
          ok: false,
          error: { code: 'UNAUTHENTICATED', message: 'The Cognito token is invalid or expired.' },
        })
      return
    }
    if (requiredRole === 'admin' && req.user.role !== 'admin' && req.user.role !== 'super-admin') {
      res
        .status(403)
        .json({ ok: false, error: { code: 'FORBIDDEN', message: 'Admin access required.' } })
      return
    }
    if (requiredRole === 'super-admin' && req.user.role !== 'super-admin') {
      res
        .status(403)
        .json({ ok: false, error: { code: 'FORBIDDEN', message: 'Super admin access required.' } })
      return
    }
    next()
  }
}
export const userAuthMiddleware = middleware()
export const userAuthAdminMiddleware = middleware('admin')
export const userAuthSuperAdminMiddleware = middleware('super-admin')
//# sourceMappingURL=index.js.map

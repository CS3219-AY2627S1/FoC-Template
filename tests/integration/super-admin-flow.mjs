import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'

const env = Object.fromEntries(
  readFileSync('.env.development', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)
const cognito = new CognitoIdentityProviderClient({
  region: env.AWS_DEFAULT_REGION,
  endpoint: 'http://localhost:4566',
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
})
const userBase = 'http://localhost:3001/api/user'
const supplierBase = 'http://localhost:8080/api/supplier'
const stamp = Date.now()
const email = 'relaytest' + stamp + '@example.com'
const username = 'RelayTest' + stamp
let password = 'TestPass123!'
const createdSuppliers = []

async function request(base, path, method = 'GET', body, cookie) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = response.status === 204 ? undefined : await response.json()
  return {
    status: response.status,
    data,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  }
}
function status(result, expected, label) {
  assert.equal(result.status, expected, label + ': ' + JSON.stringify(result.data))
}
async function login(userEmail, userPassword, expectedRole) {
  const result = await request(userBase, '/auth/login', 'POST', {
    email: userEmail,
    password: userPassword,
  })
  status(result, 200, 'login')
  assert.equal(result.data.data.user.role, expectedRole)
  assert.ok(result.cookie)
  return result.cookie
}
async function createSupplier(cookie, suffix) {
  const result = await request(
    supplierBase,
    '',
    'POST',
    {
      name: 'Relay Admin Test ' + suffix + ' ' + stamp,
      location: { lat: 1.3, lng: 103.8, buildingName: 'Integration Test', floorNumber: 1 },
      isOperational: true,
      operatingHours: { openingTime: '09:00', closingTime: '18:00', daysOfWeek: [1, 2, 3, 4, 5] },
      serviceTypes: [0],
    },
    cookie,
  )
  status(result, 201, 'supplier create ' + suffix)
  createdSuppliers.push(result.data.supplier.id)
}

let created = false
let deleted = false
let superCookie
try {
  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: env.COGNITO_USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS',
    }),
  )
  created = true
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: env.COGNITO_USER_POOL_ID,
      Username: email,
      Password: password,
      Permanent: true,
    }),
  )

  superCookie = await login(
    env.FLOCI_INITIAL_ADMIN_EMAIL,
    env.FLOCI_INITIAL_ADMIN_PASSWORD,
    'super-admin',
  )
  let userCookie = await login(email, password, 'user')
  const otherCookie = await login(email, password, 'user')
  status(
    await request(userBase, '/auth/login', 'POST', { email: 'invalid', password: '' }),
    400,
    'invalid login',
  )
  const newPassword = 'TestPass456!'
  status(
    await request(
      userBase,
      '/auth/password',
      'POST',
      {
        currentPassword: password,
        newPassword,
        newPasswordConfirmation: newPassword,
      },
      userCookie,
    ),
    204,
    'change password',
  )
  status(
    await request(userBase, '/session', 'GET', undefined, userCookie),
    401,
    'password change revokes current session',
  )
  status(
    await request(userBase, '/session', 'GET', undefined, otherCookie),
    401,
    'password change revokes other session',
  )
  password = newPassword
  userCookie = await login(email, password, 'user')
  const logoutCookie = await login(email, password, 'user')
  status(await request(userBase, '/auth/logout', 'POST', undefined, logoutCookie), 204, 'logout')
  status(
    await request(userBase, '/session', 'GET', undefined, logoutCookie),
    401,
    'logged out session',
  )
  status(
    await request(userBase, '/session', 'GET', undefined, userCookie),
    200,
    'other session remains',
  )
  status(await request(userBase, '/me', 'PATCH', { username }, userCookie), 200, 'profile create')
  status(
    await request(userBase, '/admin/promote', 'POST', { email: 'bad-email' }, superCookie),
    400,
    'invalid email',
  )
  status(
    await request(userBase, '/admin/promote', 'POST', { email }, userCookie),
    403,
    'ordinary user promote',
  )
  status(await request(userBase, '/admin/promote', 'POST', { email }, superCookie), 204, 'promote')
  status(
    await request(userBase, '/admin/promote', 'POST', { email }, superCookie),
    409,
    'already promoted',
  )
  status(
    await request(userBase, '/session', 'GET', undefined, userCookie),
    401,
    'old session revoked after promotion',
  )
  let admins = await request(userBase, '/admins', 'GET', undefined, superCookie)
  status(admins, 200, 'list admins')
  assert.ok(
    admins.data.data.some(
      (user) => user.email === email && user.username === username && user.role === 'admin',
    ),
  )
  userCookie = await login(email, password, 'admin')
  await createSupplier(superCookie, 'super')
  await createSupplier(userCookie, 'admin')
  status(await request(userBase, '/admin/demote', 'POST', { email }, superCookie), 204, 'demote')
  status(
    await request(userBase, '/admin/demote', 'POST', { email }, superCookie),
    409,
    'already demoted',
  )
  status(
    await request(userBase, '/session', 'GET', undefined, userCookie),
    401,
    'old session revoked after demotion',
  )
  userCookie = await login(email, password, 'user')
  status(
    await request(
      supplierBase,
      '',
      'POST',
      {
        name: 'Denied ' + stamp,
        location: { lat: 1.3, lng: 103.8, buildingName: 'Test', floorNumber: 1 },
        isOperational: true,
        operatingHours: { openingTime: '09:00', closingTime: '18:00', daysOfWeek: [1] },
        serviceTypes: [0],
      },
      userCookie,
    ),
    403,
    'demoted user supplier denial',
  )
  status(
    await request(userBase, '/admin/promote', 'POST', { email }, superCookie),
    204,
    'promote again',
  )
  userCookie = await login(email, password, 'admin')
  status(
    await request(userBase, '/me', 'DELETE', { confirmation: username }, userCookie),
    204,
    'normal admin self delete',
  )
  deleted = true
  status(
    await request(userBase, '/session', 'GET', undefined, userCookie),
    401,
    'deleted admin session',
  )
  status(
    await request(userBase, '/me', 'DELETE', { confirmation: username }, superCookie),
    403,
    'super admin deletion blocked',
  )
  admins = await request(userBase, '/admins', 'GET', undefined, superCookie)
  status(admins, 200, 'admins after deletion')
  assert.ok(!admins.data.data.some((user) => user.email === email))
  console.log(
    'PASS live super admin, admin, session revocation, supplier access, and admin self deletion',
  )
} finally {
  if (superCookie) {
    for (const id of createdSuppliers) {
      const result = await request(supplierBase, '/' + id, 'DELETE', undefined, superCookie)
      assert.equal(result.status, 204, 'supplier cleanup')
    }
  }
  if (created && !deleted) {
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: env.COGNITO_USER_POOL_ID,
        Username: email,
      }),
    )
  }
}

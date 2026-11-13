swagger: "2.0"
info:
  title: FoC User Service API
  description: |
    API contract for user registration, authentication, session management,
    and profile access in Friend on Campus.
  version: "1.0.0"
host: localhost:8080
basePath: /
schemes:
  - http
consumes:
  - application/json
produces:
  - application/json

securityDefinitions:
  bearerAuth:
    type: apiKey
    name: Authorization
    in: header
    description: Use the format `Bearer <access_token>`.
  internalServiceAuth:
    type: apiKey
    name: X-Internal-Service-Token
    in: header
    description: Shared secret for trusted service-to-service requests. Never expose this header to clients.

paths:
  /health:
    get:
      summary: Check service liveness
      operationId: healthCheck
      responses:
        "200":
          description: Service is healthy.
          schema:
            $ref: '#/definitions/StatusResponse'

  /ready:
    get:
      summary: Check service readiness
      operationId: readinessCheck
      responses:
        "200":
          description: Service is ready and can access its database.
          schema:
            $ref: '#/definitions/StatusResponse'
        "503":
          description: Database is unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /internal/users/{user_id}/admin:
    get:
      summary: Check whether a user is an active administrator
      description: Internal endpoint for trusted services such as Order Service. It returns false for regular, unknown, deactivated, or suspended users.
      operationId: checkUserAdmin
      security:
        - internalServiceAuth: []
      parameters:
        - in: path
          name: user_id
          required: true
          type: string
          format: uuid
      responses:
        "200":
          description: Administrative authorization result.
          schema:
            $ref: '#/definitions/AdminCheckResponse'
        "401":
          description: Internal service credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: The user_id is not a valid UUID.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Internal authorization is not configured or the database is unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /internal/users/{user_id}/status:
    get:
      summary: Check a user's account status
      description: Internal endpoint for trusted services. It returns active, deactivated, suspended, or unknown for a missing account. Consumers that only need access authorization should treat only active as allowed.
      operationId: checkUserStatus
      security:
        - internalServiceAuth: []
      parameters:
        - in: path
          name: user_id
          required: true
          type: string
          format: uuid
      responses:
        "200":
          description: Account status result.
          schema:
            $ref: '#/definitions/UserStatusResponse'
        "401":
          description: Internal service credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: The user_id is not a valid UUID.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Internal authorization is not configured or the database is unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /users:
    post:
      summary: Register a user account
      operationId: createUser
      parameters:
        - in: body
          name: user
          required: true
          schema:
            $ref: '#/definitions/UserCreate'
      responses:
        "201":
          description: User account created.
          schema:
            $ref: '#/definitions/UserResponse'
        "409":
          description: The email address or NUS student number is already in use.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: Request validation failed.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /login:
    post:
      summary: Authenticate a user
      operationId: login
      parameters:
        - in: body
          name: credentials
          required: true
          schema:
            $ref: '#/definitions/UserLogin'
      responses:
        "200":
          description: Authentication succeeded.
          schema:
            $ref: '#/definitions/LoginResponse'
        "401":
          description: Credentials are invalid or the account is inactive.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: Request validation failed.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database or authentication storage is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /logout:
    post:
      summary: Revoke the current session
      operationId: logout
      security:
        - bearerAuth: []
      responses:
        "204":
          description: Session revoked.
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "503":
          description: Authentication storage is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /users/me:
    get:
      summary: Get the authenticated user's profile
      operationId: getCurrentUser
      security:
        - bearerAuth: []
      responses:
        "200":
          description: Authenticated user's protected profile.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "503":
          description: Authentication storage is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

    patch:
      summary: Update the authenticated user's profile
      description: Omitted fields are preserved. An empty object is accepted as a no-op; PUT is also supported as an alias.
      operationId: updateCurrentUser
      security:
        - bearerAuth: []
      parameters:
        - in: body
          name: profile
          required: true
          schema:
            $ref: '#/definitions/UserUpdate'
      responses:
        "200":
          description: Updated profile.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "409":
          description: The email address is already in use.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: Request validation failed.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'
    put:
      summary: Update the authenticated user's profile
      description: Omitted fields are preserved. An empty object is accepted as a no-op. This is the PUT compatibility alias for PATCH.
      operationId: updateCurrentUserPut
      security:
        - bearerAuth: []
      parameters:
        - in: body
          name: profile
          required: true
          schema:
            $ref: '#/definitions/UserUpdate'
      responses:
        "200":
          description: Updated profile.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "409":
          description: The email address is already in use.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: Request validation failed.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'
    delete:
      summary: Deactivate the authenticated user's account
      operationId: deactivateCurrentUser
      security:
        - bearerAuth: []
      responses:
        "200":
          description: Account deactivated; the profile record is retained.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "409":
          description: The account is the last active administrator and cannot be deactivated.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /users/me/deactivate:
    post:
      summary: Deactivate the authenticated user's account
      description: POST compatibility alias for deactivating the current account. The profile record is retained.
      operationId: deactivateCurrentUserPost
      security:
        - bearerAuth: []
      responses:
        "200":
          description: Account deactivated; the profile record is retained.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "409":
          description: The account is the last active administrator and cannot be deactivated.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /admin/users:
    get:
      summary: List and search accounts
      description: An active administrator lists accounts in any status, newest first, with the account ID breaking ties. Use it to find accounts to review, including suspended and deactivated ones. Administrator rights are re-checked on every request.
      operationId: listUsers
      security:
        - bearerAuth: []
      parameters:
        - in: query
          name: q
          required: false
          type: string
          maxLength: 254
          description: Case-insensitive substring of the student number, email, or display name. The characters % and _ match literally.
        - in: query
          name: status
          required: false
          type: string
          enum:
            - active
            - deactivated
            - suspended
          description: Only return accounts in this status.
        - in: query
          name: limit
          required: false
          type: integer
          minimum: 1
          maximum: 100
          default: 20
        - in: query
          name: offset
          required: false
          type: integer
          minimum: 0
          default: 0
      responses:
        "200":
          description: One page of matching accounts.
          schema:
            $ref: '#/definitions/UserPage'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "403":
          description: The authenticated user is not an active administrator.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: A query parameter is out of range or not an allowed value.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /admin/users/{user_id}:
    get:
      summary: Read any account
      description: An active administrator reads an account's full profile in any status, so suspended and deactivated accounts can be reviewed. Unlike GET /users/{user_id}, this returns every UserResponse field. Administrator rights are re-checked on every request.
      operationId: getUserAsAdmin
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: user_id
          required: true
          type: string
          format: uuid
      responses:
        "200":
          description: The account's full profile.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "403":
          description: The authenticated user is not an active administrator.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "404":
          description: User not found.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: The user_id is not a valid UUID.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /admin/users/{user_id}/suspend:
    post:
      summary: Suspend a user account
      description: An active administrator suspends an account and all sessions belonging to it. The target cannot log in or use existing sessions afterward.
      operationId: suspendUser
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: user_id
          required: true
          type: string
          format: uuid
      responses:
        "200":
          description: User account suspended.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "403":
          description: The authenticated user is not an active administrator, the target is another administrator, or the caller is attempting to suspend their own account.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "404":
          description: User not found.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: The user_id is not a valid UUID.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /admin/users/{user_id}/grant-admin:
    post:
      summary: Grant administrator rights
      description: An active administrator promotes another active user to administrator. The caller cannot grant themselves administrator rights, and the target's existing sessions remain valid.
      operationId: grantAdminRights
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: user_id
          required: true
          type: string
          format: uuid
      responses:
        "200":
          description: Administrator rights granted.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "403":
          description: The authenticated user is not an active administrator or is attempting to grant themselves administrator rights.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "404":
          description: User not found.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "409":
          description: The target user is already an administrator or is not active.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: The user_id is not a valid UUID.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database or administrator-state locking is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /admin/users/{user_id}/revoke-admin:
    post:
      summary: Revoke administrator rights
      description: An active administrator removes administrator rights from another administrator. The caller cannot revoke their own rights, so at least one administrator remains. The target remains an active regular user and existing sessions remain valid.
      operationId: revokeAdminRights
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: user_id
          required: true
          type: string
          format: uuid
      responses:
        "200":
          description: Administrator rights revoked.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "403":
          description: The authenticated user is not an active administrator or is attempting to revoke their own rights.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "404":
          description: User not found.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "409":
          description: The target user is not currently an administrator.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: The user_id is not a valid UUID.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /admin/users/{user_id}/unsuspend:
    post:
      summary: Unsuspend a user account
      description: An active administrator restores another suspended account to active status. The target must authenticate again after restoration because existing sessions are revoked.
      operationId: unsuspendUser
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: user_id
          required: true
          type: string
          format: uuid
      responses:
        "200":
          description: User account restored to active status.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "403":
          description: The authenticated user is not an active administrator or is attempting to unsuspend their own account.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "404":
          description: User not found.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "409":
          description: The target user is not suspended.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: The user_id is not a valid UUID.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database or administrator-state locking is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /users/{user_id}:
    get:
      summary: Get another user's basic profile
      operationId: getUserProfile
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: user_id
          required: true
          type: string
          format: uuid
      responses:
        "200":
          description: The user's display name only.
          schema:
            $ref: '#/definitions/BasicProfileResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "404":
          description: User not found.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: The user_id is not a valid UUID.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'
    patch:
      summary: Update a user's profile
      description: The authenticated user may only update the profile represented by their own bearer credential. Omitted fields are preserved. An empty object is accepted as a no-op; PUT is also supported as an alias.
      operationId: updateUserProfile
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: user_id
          required: true
          type: string
          format: uuid
        - in: body
          name: profile
          required: true
          schema:
            $ref: '#/definitions/UserUpdate'
      responses:
        "200":
          description: Updated profile.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "403":
          description: The authenticated user cannot modify another user's profile.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "409":
          description: The email address is already in use.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: Request validation failed.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'
    put:
      summary: Update a user's profile
      description: The authenticated user may only update the profile represented by their own bearer credential. Omitted fields are preserved. An empty object is accepted as a no-op. This is the PUT compatibility alias for PATCH.
      operationId: updateUserProfilePut
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: user_id
          required: true
          type: string
          format: uuid
        - in: body
          name: profile
          required: true
          schema:
            $ref: '#/definitions/UserUpdate'
      responses:
        "200":
          description: Updated profile.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Bearer credentials are missing or invalid.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "403":
          description: The authenticated user cannot modify another user's profile.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "409":
          description: The email address is already in use.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: Request validation failed.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /reactivate:
    post:
      summary: Reactivate a deactivated account
      description: Root-path compatibility alias. Existing login credentials are required; no new account is created.
      operationId: reactivateUserRoot
      parameters:
        - in: body
          name: credentials
          required: true
          schema:
            $ref: '#/definitions/UserLogin'
      responses:
        "200":
          description: Existing account reactivated.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Credentials are invalid or the account is suspended.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: Request validation failed.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /users/me/reactivate:
    post:
      summary: Reactivate a deactivated account
      description: Reactivate the existing account by verifying its login credentials; no new account is created.
      operationId: reactivateCurrentUser
      parameters:
        - in: body
          name: credentials
          required: true
          schema:
            $ref: '#/definitions/UserLogin'
      responses:
        "200":
          description: Existing account reactivated.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Credentials are invalid or the account is suspended.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: Request validation failed.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

  /users/reactivate:
    post:
      summary: Reactivate a deactivated account
      operationId: reactivateUser
      parameters:
        - in: body
          name: credentials
          required: true
          schema:
            $ref: '#/definitions/UserLogin'
      responses:
        "200":
          description: Existing account reactivated.
          schema:
            $ref: '#/definitions/UserResponse'
        "401":
          description: Credentials are invalid or the account is suspended.
          schema:
            $ref: '#/definitions/ErrorResponse'
        "422":
          description: Request validation failed.
          schema:
            $ref: '#/definitions/ValidationErrorResponse'
        "503":
          description: Database is temporarily unavailable.
          schema:
            $ref: '#/definitions/ErrorResponse'

definitions:
  UserCreate:
    type: object
    additionalProperties: false
    required:
      - nus_student_number
      - email
      - display_name
      - password
    properties:
      nus_student_number:
        type: string
        description: NUS student number in the format A1234567B or U1234567B.
        pattern: '^[AaUu][0-9]{7}[A-Za-z]$'
        minLength: 9
        maxLength: 9
        example: A1234567B
      email:
        type: string
        format: email
        example: student@example.com
      display_name:
        type: string
        description: English letters separated by single spaces; surrounding whitespace is trimmed.
        pattern: '^[A-Za-z]+(?: [A-Za-z]+)*$'
        minLength: 1
        maxLength: 100
        example: Alex Tan
      password:
        type: string
        format: password
        description: 8–100 characters containing a letter, number, and special character.
        minLength: 8
        maxLength: 100
        example: Campus!123

  UserLogin:
    type: object
    additionalProperties: false
    required:
      - nus_student_number
      - password
    properties:
      nus_student_number:
        type: string
        pattern: '^[AaUu][0-9]{7}[A-Za-z]$'
        minLength: 9
        maxLength: 9
        example: A1234567B
      password:
        type: string
        format: password
        minLength: 1
        maxLength: 100
        example: Campus!123

  UserUpdate:
    type: object
    additionalProperties: false
    description: Mutable fields are optional, omitted fields are preserved, and an empty object is accepted as a no-op.
    properties:
      email:
        type: string
        format: email
        example: new-address@example.com
      display_name:
        type: string
        description: English letters separated by single spaces; surrounding whitespace is trimmed.
        pattern: '^[A-Za-z]+(?: [A-Za-z]+)*$'
        minLength: 1
        maxLength: 100
        example: Alex Tan
      password:
        type: string
        format: password
        description: 8–100 characters containing a letter, number, and special character.
        minLength: 8
        maxLength: 100

  UserResponse:
    type: object
    required:
      - id
      - nus_student_number
      - email
      - display_name
      - role
      - status
      - created_at
      - updated_at
    properties:
      id:
        type: string
        format: uuid
      nus_student_number:
        type: string
      email:
        type: string
        format: email
      display_name:
        type: string
      role:
        type: string
        enum:
          - user
          - admin
      status:
        type: string
        enum:
          - active
          - deactivated
          - suspended
      created_at:
        type: string
        format: date-time
      updated_at:
        type: string
        format: date-time

  UserPage:
    type: object
    required:
      - items
      - total
      - limit
      - offset
    properties:
      items:
        type: array
        items:
          $ref: '#/definitions/UserResponse'
      total:
        type: integer
        description: Number of accounts matching the filters, across all pages.
      limit:
        type: integer
      offset:
        type: integer

  BasicProfileResponse:
    type: object
    required:
      - display_name
    properties:
      display_name:
        type: string

  AdminCheckResponse:
    type: object
    required:
      - is_admin
    properties:
      is_admin:
        type: boolean
        description: True only when the account exists, is active, and has role admin.

  UserStatusResponse:
    type: object
    required:
      - status
    properties:
      status:
        type: string
        enum:
          - active
          - deactivated
          - suspended
          - unknown
        description: Account status. Unknown represents a missing user and avoids disclosing account existence.

  LoginResponse:
    type: object
    required:
      - access_token
      - token_type
      - expires_in
      - user
    properties:
      access_token:
        type: string
        description: Opaque bearer token. Store it securely and send it in the Authorization header.
        pattern: '^[A-Za-z0-9_-]{20,256}$'
      token_type:
        type: string
        enum:
          - bearer
      expires_in:
        type: integer
        format: int32
        description: Inactivity lifetime in seconds.
        example: 1800
      user:
        $ref: '#/definitions/UserResponse'

  StatusResponse:
    type: object
    required:
      - status
    properties:
      status:
        type: string
        enum:
          - healthy
          - ready
        example: healthy

  ErrorResponse:
    type: object
    required:
      - detail
    properties:
      detail:
        type: string

  ValidationErrorResponse:
    type: object
    required:
      - detail
    properties:
      detail:
        type: array
        items:
          type: object
          properties:
            loc:
              type: array
              items:
                type: string
            msg:
              type: string
            type:
              type: string

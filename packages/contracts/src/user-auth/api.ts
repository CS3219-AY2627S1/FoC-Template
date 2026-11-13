import type {
  ChangePasswordRequest,
  DemoteAdminToUserRequest,
  LoginRequest,
  PromoteUserToAdminRequest,
  RegisterRequest,
  ResendVerificationRequest,
  SubmitOtpAndLoginRequest,
} from './requests'
import type {
  ApiResult,
  LoginResponse,
  RegisterResponse,
  SubmitOtpAndLoginResponse,
} from './responses'

/** Identity and role management boundary served under /api/auth. */
export interface UserAuthApi {
  register(request: RegisterRequest): Promise<ApiResult<RegisterResponse>>
  resendVerification(request: ResendVerificationRequest): Promise<ApiResult<undefined>>
  submitOtpAndLogin(
    request: SubmitOtpAndLoginRequest,
  ): Promise<ApiResult<SubmitOtpAndLoginResponse>>
  login(request: LoginRequest): Promise<ApiResult<LoginResponse>>
  refresh(): Promise<ApiResult<import('./responses').RefreshResponse>>
  getAuth(): Promise<ApiResult<import('./responses').GetAuthResponse>>
  logout(): Promise<ApiResult<undefined>>
  changePassword(request: ChangePasswordRequest): Promise<ApiResult<undefined>>
  promoteUserToAdmin(request: PromoteUserToAdminRequest): Promise<ApiResult<undefined>>
  demoteAdminToUser(request: DemoteAdminToUserRequest): Promise<ApiResult<undefined>>
}

import type { DeleteUserRequest, UpdateUserRequest } from './requests'
import type {
  ApiResult,
  GetUserResponse,
  UpdateUserResponse,
  GetUserProfileBySubjectResponse,
  DeleteUserResponse,
} from './responses'
/** Browser-facing profile boundary served by User Service. */
export interface UserApi {
  getUser(): Promise<ApiResult<GetUserResponse>>
  updateUser(request: UpdateUserRequest): Promise<ApiResult<UpdateUserResponse>>
  deleteUser(request: DeleteUserRequest): Promise<ApiResult<DeleteUserResponse>>
}
export interface UserProfileLookupApi {
  getProfileBySubject(subject: string): Promise<ApiResult<GetUserProfileBySubjectResponse>>
}

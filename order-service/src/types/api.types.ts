export interface ApiResponse<T = unknown> {
    success: boolean;
    message?: string;
    data?: T;
}

// API error response from server
export interface ApiErrorResponse {
    success: false;
    code: string;
    message: string;
}

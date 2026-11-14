export interface ApiErrorPayload {
  code: string;
  message: string;
}

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorPayload;
}

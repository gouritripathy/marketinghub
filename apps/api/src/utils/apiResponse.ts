export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: ApiError;
};

export const ok = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
});

export const fail = (code: string, message: string, details?: unknown): ApiResponse<never> => ({
  success: false,
  error: { code, message, details },
});

export type UserRole = 'ADMIN' | 'MEMBER' | 'REVIEWER';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  teamId?: string | null;
  createdAt?: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

type LoginResponse = {
  user: AuthUser;
  accessToken: string;
};

type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

type UpdateUserPayload = {
  name?: string;
  email?: string;
  role?: UserRole;
  password?: string;
};

const getApiBaseUrl = () => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured');
  }
  return baseUrl.replace(/\/$/, '');
};

const parseResponse = async <T>(res: Response) => {
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !body?.success) {
    throw new Error(body?.error?.message ?? 'Request failed');
  }
  return body.data as T;
};

export const authClient = {
  login: async (payload: { email: string; password: string }) => {
    const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await parseResponse<LoginResponse>(res);
    return data.user;
  },
  logout: async () => {
    const res = await fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error('Logout failed');
    }
  },
  me: async () => {
    const res = await fetch(`${getApiBaseUrl()}/auth/me`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    return parseResponse<AuthUser>(res);
  },
  createUser: async (payload: CreateUserPayload) => {
    const res = await fetch(`${getApiBaseUrl()}/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse<AuthUser>(res);
  },
  listUsers: async () => {
    const res = await fetch(`${getApiBaseUrl()}/auth/users`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    return parseResponse<AuthUser[]>(res);
  },
  updateUser: async (userId: string, payload: UpdateUserPayload) => {
    const res = await fetch(`${getApiBaseUrl()}/auth/users/${userId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse<AuthUser>(res);
  },
};

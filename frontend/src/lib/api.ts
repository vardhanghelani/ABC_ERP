import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const method = (original?.method || 'get').toLowerCase()
    const isSafeToRetry = method === 'get' || method === 'head'

    if (error.response?.status === 401 && !original._retry && isSafeToRetry) {
      original._retry = true
      try {
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
        localStorage.setItem('accessToken', data.data.accessToken)
        original.headers.Authorization = `Bearer ${data.data.accessToken}`
        return api(original)
      } catch {
        localStorage.removeItem('accessToken')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export interface ApiResponse<T = unknown> {
  success: boolean
  message: string
  data: T
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export async function fetchApi<T>(
  url: string,
  params?: Record<string, unknown>,
  options?: { signal?: AbortSignal; headers?: Record<string, string> }
): Promise<T> {
  const { data } = await api.get<ApiResponse<T>>(url, {
    params,
    signal: options?.signal,
    headers: options?.headers,
  })
  return data.data
}

export async function postApi<T>(
  url: string,
  body?: unknown,
  options?: { idempotencyKey?: string }
): Promise<T> {
  const headers = options?.idempotencyKey
    ? { 'Idempotency-Key': options.idempotencyKey }
    : undefined
  const { data } = await api.post<ApiResponse<T>>(url, body, {
    headers,
    // Never allow axios-level retries for mutations
    validateStatus: (status) => status >= 200 && status < 300,
  })
  return data.data
}

export async function putApi<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.put<ApiResponse<T>>(url, body)
  return data.data
}

export async function deleteApi<T>(url: string): Promise<T> {
  const { data } = await api.delete<ApiResponse<T>>(url)
  return data.data
}

/** Download protected files (PDF, Excel) with Bearer auth instead of window.open */
export async function downloadAuthenticated(path: string, filename: string): Promise<void> {
  const response = await api.get(path, { responseType: 'blob' })
  const rawType = response.headers['content-type']
  const contentType = typeof rawType === 'string' ? rawType : 'application/octet-stream'
  const blob = new Blob([response.data], { type: contentType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

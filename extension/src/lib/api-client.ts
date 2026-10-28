namespace LogpilotApi {
  export const BASE_URL = "http://127.0.0.1:8000/api";

  export class ApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }

  export async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, { ...init, headers, cache: "no-store" });
    } catch {
      throw new ApiError("Backend Logpilot tidak dapat dijangkau. Pastikan aplikasi berjalan.", 0);
    }

    if (!response.ok) {
      let message = "Permintaan ke backend belum dapat diproses.";
      try {
        const body = await response.json() as { detail?: unknown };
        if (typeof body.detail === "string") message = body.detail;
      } catch {
        // Keep the user-facing fallback when the backend does not return JSON.
      }
      throw new ApiError(message, response.status);
    }

    return response.json() as Promise<T>;
  }
}

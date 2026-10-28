export const API_BASE = "http://127.0.0.1:8000/api";

export async function apiError(response: Response, fallback: string) {
  try {
    const result = await response.json();
    return typeof result.detail === "string" ? result.detail : fallback;
  } catch {
    return fallback;
  }
}

export async function login({ username, password, rememberDevice = false }) {
  return fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, rememberDevice }),
    credentials: "include",
  });
}

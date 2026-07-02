import { apiClient } from "./client";

interface TokenResponse {
  access_token: string;
}

export async function login(identifier: string, password: string): Promise<string> {
  const { data } = await apiClient.post<TokenResponse>("/auth/login", {
    identifier,
    password,
  });
  return data.access_token;
}

export async function register(input: {
  username: string;
  email: string;
  displayName: string;
  password: string;
}): Promise<string> {
  const { data } = await apiClient.post<TokenResponse>("/auth/register", {
    username: input.username,
    email: input.email,
    display_name: input.displayName,
    password: input.password,
  });
  return data.access_token;
}

export async function verifyEmail(token: string): Promise<void> {
  await apiClient.post("/auth/verify-email", { token });
}

export async function resendVerification(): Promise<void> {
  await apiClient.post("/auth/resend-verification");
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await apiClient.post("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export async function forgotPassword(email: string): Promise<void> {
  await apiClient.post("/auth/forgot-password", { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiClient.post("/auth/reset-password", {
    token,
    new_password: newPassword,
  });
}

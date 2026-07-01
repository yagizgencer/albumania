import { apiClient } from "./client";
import type { Album } from "./albums";

export type NotificationType =
  | "friend_request"
  | "friend_accept"
  | "listen_invite"
  | "friend_published"
  | "comment_liked";

export type NotificationScope = "bell" | "listen_invites" | "friend_requests";

export interface NotificationSummary {
  bell: number;
  listen_invites: number;
  friend_requests: number;
}

export interface NotificationItem {
  id: number;
  type: NotificationType;
  actor_username: string | null;
  actor_picture_url: string | null;
  friendship_id: number | null;
  invite_id: number | null;
  album: Album | null;
  read: boolean;
  created_at: string;
}

export async function getNotificationSummary(): Promise<NotificationSummary> {
  const { data } = await apiClient.get<NotificationSummary>(
    "/notifications/summary"
  );
  return data;
}

export async function listNotifications(
  limit = 30
): Promise<NotificationItem[]> {
  const { data } = await apiClient.get<NotificationItem[]>("/notifications", {
    params: { limit },
  });
  return data;
}

export async function markSeen(scope: NotificationScope): Promise<void> {
  await apiClient.post("/notifications/mark-seen", { scope });
}

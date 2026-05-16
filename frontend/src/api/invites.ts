import { apiClient } from "./client";
import type { Album } from "./albums";
import type { Rating } from "./ratings";

export type ListenInviteStatus = "pending" | "accepted" | "completed";

export interface ListenInvite {
  id: number;
  sender_username: string;
  receiver_username: string;
  album_id: number;
  status: ListenInviteStatus;
  created_at: string;
  responded_at: string | null;
}

export interface ListenInviteWithAlbum extends ListenInvite {
  album: Album;
}

export interface ListenInviteListResponse {
  incoming: ListenInviteWithAlbum[];
  outgoing: ListenInviteWithAlbum[];
  completed: ListenInviteWithAlbum[];
}

export interface ListenLaterParticipant {
  username: string;
  direction: "outgoing" | "incoming";
  invite_status: ListenInviteStatus;
  they_published: boolean;
}

export interface ListenLaterEntry {
  album: Album;
  rating: Rating | null;
  participants: ListenLaterParticipant[];
}

export async function createInvite(
  username: string,
  albumId: number
): Promise<ListenInvite> {
  const { data } = await apiClient.post<ListenInvite>("/invites", {
    username,
    album_id: albumId,
  });
  return data;
}

export async function acceptInvite(id: number): Promise<ListenInvite> {
  const { data } = await apiClient.post<ListenInvite>(`/invites/${id}/accept`);
  return data;
}

export async function declineInvite(id: number): Promise<void> {
  await apiClient.post(`/invites/${id}/decline`);
}

export async function listMyInvites(): Promise<ListenInviteListResponse> {
  const { data } = await apiClient.get<ListenInviteListResponse>("/invites/me");
  return data;
}

export async function getListenLater(): Promise<ListenLaterEntry[]> {
  const { data } = await apiClient.get<ListenLaterEntry[]>("/listen-later");
  return data;
}

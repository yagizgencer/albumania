import { apiClient } from "./client";
import type { Album } from "./albums";
import type { Rating } from "./ratings";

export type ListenInviteStatus = "pending" | "accepted" | "completed";

export interface ListenInvite {
  id: number;
  sender_username: string;
  receiver_username: string;
  sender_picture_url: string | null;
  receiver_picture_url: string | null;
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
}

export interface ListenLaterParticipant {
  username: string;
  picture_url: string | null;
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

export async function cancelInvite(id: number): Promise<void> {
  await apiClient.delete(`/invites/${id}`);
}

export async function listMyInvites(): Promise<ListenInviteListResponse> {
  const { data } = await apiClient.get<ListenInviteListResponse>("/invites/me");
  return data;
}

export async function getListenLater(): Promise<ListenLaterEntry[]> {
  const { data } = await apiClient.get<ListenLaterEntry[]>("/listen-later");
  return data;
}

/** The "Completed" tab: all my published ratings (newest first), with the same
 *  participant chips as the active list so the cards render identically. Each
 *  entry's `rating` is always present here (published). */
export async function getListenLaterCompleted(): Promise<ListenLaterEntry[]> {
  const { data } = await apiClient.get<ListenLaterEntry[]>("/listen-later/completed");
  return data;
}

/** Remove an album from my Listen Later — deletes my draft (if any) and
 *  withdraws me from any invite for it, so accepted-invite rows with no draft
 *  can be removed too. */
export async function removeFromListenLater(albumId: number): Promise<void> {
  await apiClient.delete(`/listen-later/${albumId}`);
}

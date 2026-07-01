import { apiClient } from "./client";

export type Visibility = "public" | "friends" | "private";
export type ReactionValue = "up" | "down" | "none";
export type CommentSort = "recent" | "score";
export type SortOrder = "asc" | "desc";

export interface CommentAuthor {
  username: string;
  display_name: string;
  picture_url: string | null;
}

export interface Comment {
  id: number;
  text: string;
  visibility: Visibility;
  // null when the author's identity is masked from the viewer.
  author: CommentAuthor | null;
  is_mine: boolean;
  created_at: string;
  edited_at: string | null;
  likes: number;
  dislikes: number;
  viewer_reaction: "up" | "down" | null;
}

export interface CommentReactionResult {
  likes: number;
  dislikes: number;
  viewer_reaction: "up" | "down" | null;
}

export async function listComments(
  spotifyId: string,
  sort: CommentSort = "recent",
  order: SortOrder = "desc"
): Promise<Comment[]> {
  const { data } = await apiClient.get<Comment[]>(`/albums/${spotifyId}/comments`, {
    params: { sort, order },
  });
  return data;
}

export async function createComment(
  spotifyId: string,
  body: { text: string; visibility: Visibility }
): Promise<Comment> {
  const { data } = await apiClient.post<Comment>(`/albums/${spotifyId}/comments`, body);
  return data;
}

export async function updateComment(
  commentId: number,
  body: { text?: string; visibility?: Visibility }
): Promise<Comment> {
  const { data } = await apiClient.patch<Comment>(`/comments/${commentId}`, body);
  return data;
}

export async function deleteComment(commentId: number): Promise<void> {
  await apiClient.delete(`/comments/${commentId}`);
}

export async function reactToComment(
  commentId: number,
  value: ReactionValue
): Promise<CommentReactionResult> {
  const { data } = await apiClient.put<CommentReactionResult>(
    `/comments/${commentId}/reaction`,
    { value }
  );
  return data;
}

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../api/client";

interface UserProfile {
  username: string;
  email: string;
  display_name: string;
  profile_visibility: "public" | "private";
  created_at: string;
}

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    apiClient
      .get<UserProfile>(`/users/${username}`)
      .then(({ data }) => setProfile(data))
      .catch(() => setError("Could not load profile"));
  }, [username]);

  if (error) return <main><p className="error">{error}</p></main>;
  if (!profile) return <main><p>Loading…</p></main>;

  return (
    <main>
      <h1>{profile.display_name}</h1>
      <p>@{profile.username}</p>
      <p>{profile.email}</p>
      <p>Visibility: {profile.profile_visibility}</p>
      <p>Member since: {new Date(profile.created_at).toLocaleDateString()}</p>
    </main>
  );
}

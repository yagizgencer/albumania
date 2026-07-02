// Route path builders. Usernames can contain characters that are unsafe in a
// URL path — notably "#" (which the browser treats as a fragment delimiter, so
// `/profile/#1 fan` collapses to `/profile/`) and spaces. Always build the path
// through here so the value is percent-encoded; React Router decodes it back in
// `useParams`, and FastAPI decodes it on the backend.
export function profilePath(username: string): string {
  return `/profile/${encodeURIComponent(username)}`;
}

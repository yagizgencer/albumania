import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { VerifyBanner } from "./components/VerifyBanner";
import { AuthProvider } from "./context/AuthContext";
import { NotificationsProvider } from "./context/NotificationsContext";
import { UnsavedChangesProvider } from "./lib/unsavedChanges";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { AlbumDetailPage } from "./pages/AlbumDetailPage";
import { AlbumInfoPage } from "./pages/AlbumInfoPage";
import { ArtistPage } from "./pages/ArtistPage";
import { FriendAlbumDetailPage } from "./pages/FriendAlbumDetailPage";
import { ListenLaterPage } from "./pages/ListenLaterPage";
import { FriendsPage } from "./pages/FriendsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RatingEditorPage } from "./pages/RatingEditorPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";

// App chrome + providers. This is the layout route's element, rendered inside the
// data router so all children (and the providers, which use router hooks) have
// router context. A data router is required for useBlocker (see RatingEditorPage).
function AppLayout() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <UnsavedChangesProvider>
          <NavBar />
          <VerifyBanner />
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </UnsavedChangesProvider>
      </NotificationsProvider>
    </AuthProvider>
  );
}

const protectedRoutes = [
  { path: "/settings", element: <SettingsPage /> },
  { path: "/profile/:username", element: <ProfilePage /> },
  { path: "/users/:username/albums/:spotifyId", element: <AlbumDetailPage /> },
  { path: "/friends", element: <FriendsPage /> },
  { path: "/friendships/:friendshipId/albums/:spotifyId", element: <FriendAlbumDetailPage /> },
  { path: "/users/:username/compare/:spotifyId", element: <FriendAlbumDetailPage /> },
  { path: "/listen-later", element: <ListenLaterPage /> },
  { path: "/albums/:spotifyId", element: <AlbumInfoPage /> },
  { path: "/artists/:artistId", element: <ArtistPage /> },
  { path: "/albums/:spotifyId/rate", element: <RatingEditorPage /> },
].map((r) => ({
  path: r.path,
  element: <ProtectedRoute>{r.element}</ProtectedRoute>,
}));

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/verify-email", element: <VerifyEmailPage /> },
      { path: "/", element: <HomePage /> },
      ...protectedRoutes,
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}

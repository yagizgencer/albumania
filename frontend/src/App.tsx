import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { VerifyBanner } from "./components/VerifyBanner";
import { AuthProvider } from "./context/AuthContext";
import { NotificationsProvider } from "./context/NotificationsContext";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { AlbumDetailPage } from "./pages/AlbumDetailPage";
import { AlbumInfoPage } from "./pages/AlbumInfoPage";
import { FriendAlbumDetailPage } from "./pages/FriendAlbumDetailPage";
import { ListenLaterPage } from "./pages/ListenLaterPage";
import { FriendsPage } from "./pages/FriendsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RatingEditorPage } from "./pages/RatingEditorPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationsProvider>
          <NavBar />
          <VerifyBanner />
          <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/" element={<HomePage />} />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile/:username"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/:username/albums/:spotifyId"
              element={
                <ProtectedRoute>
                  <AlbumDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/friends"
              element={
                <ProtectedRoute>
                  <FriendsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/friendships/:friendshipId/albums/:spotifyId"
              element={
                <ProtectedRoute>
                  <FriendAlbumDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/listen-later"
              element={
                <ProtectedRoute>
                  <ListenLaterPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/albums/:spotifyId"
              element={
                <ProtectedRoute>
                  <AlbumInfoPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/albums/:spotifyId/rate"
              element={
                <ProtectedRoute>
                  <RatingEditorPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </NotificationsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

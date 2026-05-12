import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { userId, isLoading } = useAuth();

  if (isLoading) return <p>Loading…</p>;
  if (!userId) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

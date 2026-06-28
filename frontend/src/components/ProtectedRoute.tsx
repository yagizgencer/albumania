import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LoadingState } from "./Spinner";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { username, isLoading } = useAuth();

  if (isLoading) return <LoadingState />;
  if (!username) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

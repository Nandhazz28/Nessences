import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { ErrorState } from "./States.jsx";

export function SessionGate({ from }) {
  const { authError, revalidate } = useAuth();
  const loc = useLocation();
  if (authError) return <ErrorState error={authError} onRetry={revalidate} />;
  return (
    <Navigate to="/login" state={{ from: from ?? loc.pathname }} replace />
  );
}

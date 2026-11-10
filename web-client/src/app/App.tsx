import { AuthProvider } from "./auth-provider";
import { AppRoutes } from "./routes";

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

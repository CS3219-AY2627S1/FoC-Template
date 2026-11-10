import { Navigate, Outlet, useLocation } from "react-router-dom";
import useAuth from "@/hooks/useAuth";

import { Spinner } from "@/components/ui/spinner"
import { ROUTES } from "@/routes/routes";

const ProtectedRoute = () => {
    const { isAuthenticated, isInitializing } = useAuth();
    const location = useLocation();

    if (isInitializing) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Spinner className="size-10" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
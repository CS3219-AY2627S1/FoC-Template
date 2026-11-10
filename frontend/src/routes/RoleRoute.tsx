import { Navigate, Outlet, useNavigate } from "react-router-dom";
import useAuth from "@/hooks/useAuth";
import type { Role } from "@/features/auth/types/auth.types";

import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/routes/routes";

interface RoleRouteProps {
    allowedRoles: Role[];
}

const RoleRoute = ({ allowedRoles }: RoleRouteProps) => {
    const { user, isAuthenticated, isInitializing } = useAuth();
    const navigate = useNavigate();

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

    if (!user || !allowedRoles.includes(user.role)) {
        return (
            <div className="min-h-screen flex flex-col gap-1 items-center justify-center px-5">
                <p className="text-red-500 text-lg font-semibold text-center">
                    Unauthorized
                </p>
                <p className="text-red-500 text-lg font-semibold text-center">
                    You do not have permission to access this page.
                </p>
                <Button onClick={() => navigate(-1)} size="lg" variant="destructive">
                    Go Back
                </Button>
            </div>
        )
    }

    return <Outlet />;
};

export default RoleRoute;
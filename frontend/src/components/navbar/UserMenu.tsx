import { Link } from "react-router-dom";
import { LogOutIcon, UserIcon } from "lucide-react";

import useAuth from "@/hooks/useAuth";
import useLogout from "@/hooks/useLogout";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const UserMenu = () => {
    const { user } = useAuth();
    const { logout } = useLogout();

    if (!user) {
        return null;
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant="linkIndigo"
                        className="min-w-0 text-sm font-semibold m-0"
                        title={user.username}
                    />
                }
            >
                <span className="block min-w-0 max-w-[24ch] truncate">
                    {user.username}
                </span>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" side="bottom" sideOffset={8}>
                <DropdownMenuItem>
                    <UserIcon />
                    <Link to="/profile">
                        Profile
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                    variant="destructive"
                    onClick={() => logout()}
                    className="cursor-pointer"
                >
                    <LogOutIcon />
                    Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default UserMenu;

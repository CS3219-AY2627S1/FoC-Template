import { NavLink } from "react-router-dom";
import type { NavLinkItem } from "./navLinks";

interface DesktopNavProps {
    links: NavLinkItem[];
}

const DesktopNav = ({ links }: DesktopNavProps) => {
    return (
        <nav className="hidden items-center gap-3 lg:gap-6 md:flex">
            {links.map(({ label, href }) => (
                <NavLink
                    key={href}
                    to={href}
                    className={({ isActive }) =>
                        `w-fit text-sm font-medium text-center ${isActive
                            ? "text-zinc-800"
                            : "text-zinc-500 hover:text-zinc-700"
                        }`
                    }
                >
                    {label}
                </NavLink>
            ))}
        </nav>
    );
};

export default DesktopNav;
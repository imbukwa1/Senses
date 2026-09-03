import { FolderKanban, Home, Search } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type NavigationItem = {
  label: string;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
};

export const navigationItems: NavigationItem[] = [
  {
    label: "Home",
    to: "/",
    icon: Home,
    end: true,
  },
  {
    label: "Projects",
    to: "/projects",
    icon: FolderKanban,
  },
  {
    label: "Search",
    to: "/search",
    icon: Search,
  },
];

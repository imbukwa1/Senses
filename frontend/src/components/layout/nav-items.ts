import { AlertTriangle, ClipboardCheck, FolderKanban, Home, Search } from "lucide-react";
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
    label: "Attention",
    to: "/attention",
    icon: AlertTriangle,
  },
  {
    label: "My Work",
    to: "/my-work",
    icon: ClipboardCheck,
  },
  {
    label: "Search",
    to: "/search",
    icon: Search,
  },
];

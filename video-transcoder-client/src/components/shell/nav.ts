import { FileVideo, Settings, UploadCloud, User, type LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { title: "Upload", href: "/upload", icon: UploadCloud, description: "Add a video to transcode" },
  { title: "Library", href: "/assets", icon: FileVideo, description: "Your videos and renditions" },
  { title: "Account", href: "/user", icon: User, description: "Your profile" },
  { title: "Settings", href: "/settings", icon: Settings, description: "Appearance and environment" },
];

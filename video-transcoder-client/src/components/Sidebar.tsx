"use client";

import { FileVideoIcon, Settings, UploadCloudIcon, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<any>;
}

const navItems: NavItem[] = [
  {
    title: "Upload",
    icon: UploadCloudIcon,
    href: "/upload",
  },

  {
    title: "Assets",
    icon: FileVideoIcon,
    href: "/assets",
  },

  {
    title: "User",
    icon: User,
    href: "/user",
  },

  {
    title: "Settings",
    icon: Settings,
    href: "/settings",
  },
];

const Sidebar = () => {
  const pathname = usePathname();
  return (
    <div className="hidden md:flex flex-col w-64 border-r bg-gray-100/40 dark:bg-gray-800/40">
      <div className="flex-1 overflow-auto">
        <nav className="flex-1 py-4">
          {navItems.map((item: NavItem) => (
            <Link
              key={item.title} // Add a unique key for each link
              className={`flex items-center h-10 px-4 mx-4 text-md font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50 rounded-lg cursor-pointer  ${
                pathname == item.href
                  ? "text-zinc-800 bg-black/10"
                  : "text-gray-500 hover:text-gray-950"
              }`}
              href={item.href}
            >
              <div className="flex flex-1 items-center">
                {item.icon && <item.icon className="h-5 w-5 mr-3" />}
                {item.title}
              </div>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default Sidebar;

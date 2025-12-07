import React from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "./ui/use-toast";
import { useDispatch } from "react-redux";
import { UserType, userNotExist } from "@/redux/reducer/userReducer";
import { SERVER } from "@/constants";

interface HeaderProps {
  user: UserType | null;
}

const Header = ({ user }: HeaderProps) => {
  const router = useRouter();
  const dispatch = useDispatch();

  const handleSignOut = async () => {
    try {
      const { data } = await axios.get(
        `${SERVER}/user/logout`,
        { withCredentials: true }
      );
      dispatch(userNotExist());
      toast({ title: data.message });
      router.push("/");
    } catch (error) {
      // Handle error
      console.error("Error occurred during sign out:", error);
      // Optionally, show error message to the user
    }
  };

  return (
    <div className="w-full">
      <header className="flex h-16 items-center justify-between  border-b border-gray-200 px-4 md:px-6 dark:border-gray-800">
        <Link className="text-[1.6rem] font-bold" href="/">
          Transcoder
        </Link>

        <div className="flex gap-4">
          <Button
            className="text-lg hover:bg-gray-800 hover:text-white transition-all duration-300"
            variant="secondary"
            onClick={handleSignOut}
          >
            Sign out
          </Button>

          <Avatar>
            <AvatarImage
              src={user ? `${user.avatar}` : "https://github.com/shadcn.png"}
            />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
        </div>
      </header>
    </div>
  );
};

export default Header;

"use client";

import React from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RootState } from "@/redux/reducer/userReducer";
import { useSelector } from "react-redux";

const Page = () => {
  const { user } = useSelector((state: RootState) => state.userReducer);
  return (
    <div className="min-h-screen w-4/5">
      <div className="w-full p-8 rounded-lg">
        <h1 className="text-2xl font-bold mb-4">Account</h1>
        <p className="text-gray-600 mb-8">Your account details</p>
        <div className="space-y-6">
          <section aria-labelledby="profile-heading">
            <h2
              className="font-semibold text-gray-900 mb-2"
              id="profile-heading"
            >
              Profile
            </h2>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-4">
                <Avatar>
                  <AvatarImage
                    alt="Amanda Lee"
                    src={
                      user
                        ? `${user.avatar}`
                        : "/placeholder.svg?height=40&width=40"
                    }
                  />
                  <AvatarFallback>AL</AvatarFallback>
                </Avatar>
                <span className="font-medium text-gray-900">
                  {user?.displayName || "John Doe"}
                </span>
              </div>
            </div>
          </section>
          <section aria-labelledby="username-heading">
            <h2
              className="font-semibold text-gray-900 mb-2"
              id="username-heading"
            >
              Username
            </h2>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="font-medium text-gray-900">
                {" "}
                {user
                  ? `${user.displayName.replace(" ", "").trim().toLowerCase()}`
                  : "johndoe"}
              </span>
            </div>
          </section>
          <section aria-labelledby="email-heading">
            <h2 className="font-semibold text-gray-900 mb-2" id="email-heading">
              Email address
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900">
                    {user ? `${user.email}` : "amanda.lee@example.com"}
                  </span>
                  <Badge variant="secondary">Primary</Badge>
                </div>
               
              </div>
           
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Page;

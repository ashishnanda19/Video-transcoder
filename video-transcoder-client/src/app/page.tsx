"use client";

import { Button } from "@/components/ui/button";
import { SERVER } from "@/constants";
import {
  RootState,
  userExist,
  userNotExist,
} from "@/redux/reducer/userReducer";
import axios from "axios";
import { CloudLightning } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";



const Page = () => {
  const router = useRouter();
  const dispatch = useDispatch();
  useEffect(() => {
    axios
      .get(
        `${SERVER}/user/current-user`,
        {
          withCredentials: true,
        }
      )
      .then((res) => dispatch(userExist(res.data.data)))
      .catch((err) => dispatch(userNotExist()));
  }, [dispatch]);


  const { isAuthenticated } = useSelector(
    (state: RootState) => state.userReducer
  );

  return (
    <div className="flex flex-col h-screen">
      <div className="px-4 lg:px-6 h-14 flex items-center justify-between mt-2">
        <Link className="flex items-center justify-center" href="/">
          <CloudLightning className="h-6 w-6" />
        </Link>

        <Button onClick={() => router.push("/signin")}>Signup for free</Button>
      </div>
      <main className="flex justify-center items-center">
        <section className="w-full py-10 md:py-18 lg:py-28 ">
          <div className="container flex flex-col items-center justify-center space-y-4 px-4 md:px-6 text-center sm:space-y-10">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl xl:text-6xl/none mb-6">
                Video Transcoding as a Service
              </h1>
              <p className="max-w-[38vw] mx-auto text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400">
                Effortlessly convert video files into the formats you need with
                our powerful API. Perfect for on-the-fly transcoding, try our
                free trials and more.
              </p>
            </div>
            <div className="flex flex-col gap-1 min-[400px]:flex-row">
              {isAuthenticated ? (
                <Button onClick={() => router.push("/upload")}>
                  Get started
                </Button>
              ) : (
                <Button onClick={() => router.push("/signin")}>
                  Get started
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Page;

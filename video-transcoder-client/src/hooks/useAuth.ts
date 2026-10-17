"use client";

import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { RootState, userExist, userNotExist } from "@/redux/reducer/userReducer";

// Loads the signed-in user once (kept in Redux) and optionally redirects visitors who are not signed in.
export function useAuth({ requireAuth = false }: { requireAuth?: boolean } = {}) {
  const dispatch = useDispatch();
  const router = useRouter();
  const { user, isAuthenticated, loader } = useSelector((s: RootState) => s.userReducer);

  useEffect(() => {
    if (!loader) return;
    api
      .get("/user/current-user")
      .then((res) => dispatch(userExist(res.data.data)))
      .catch(() => dispatch(userNotExist()));
  }, [loader, dispatch]);

  useEffect(() => {
    if (requireAuth && !loader && !isAuthenticated) router.replace("/signin");
  }, [requireAuth, loader, isAuthenticated, router]);

  return { user, isAuthenticated, loading: loader };
}

export function useSignOut() {
  const dispatch = useDispatch();
  const router = useRouter();
  return async () => {
    try {
      await api.get("/user/logout");
    } finally {
      dispatch(userNotExist());
      router.push("/");
    }
  };
}

"use client";

import { useEffect } from "react";
import { Crisp } from "crisp-sdk-web";

export const CrispChat = () => {
  useEffect(() => {
    Crisp.configure("ff6b5e15-6f49-40ef-ae0c-581f1ab09f80");
  }, []);

  return null;
};

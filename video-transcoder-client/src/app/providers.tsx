"use client";

import { Provider } from "react-redux";
import { ThemeProvider } from "next-themes";
import React from "react";
import { store } from "@/redux/store";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </Provider>
  );
}

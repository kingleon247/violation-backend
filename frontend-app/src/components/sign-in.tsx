// src/components/sign-in.tsx

"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function SignIn() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async (provider: string) => {
    setIsLoading(true);
    try {
      // Use the signIn function from next-auth/react
      await signIn(provider, { callbackUrl: "/" });
      // No need to set isLoading back to false here, page will redirect
    } catch (error) {
      console.error("Authentication error:", error);
      setIsLoading(false); // Set loading to false only on error
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      <button
        onClick={() => handleSignIn("google")}
        disabled={isLoading}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-white dark:ring-zinc-700 dark:hover:bg-zinc-700"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Google</title>
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        {isLoading ? "Connecting..." : "Continue with Google"}
      </button>

      {/* Apple Sign-In Button */}
      {/* <button
        onClick={() => handleSignIn("apple")}
        disabled={isLoading}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-white dark:ring-zinc-700 dark:hover:bg-zinc-700"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Apple</title>
          <path
            d="M14.94 5.19A4.38 4.38 0 0 0 16 2.5a4.38 4.38 0 0 0-2.91 1.5 4.1 4.1 0 0 0-1.03 2.96c2.23.17 4.01-1.44 4.01-1.44"
            fill="currentColor"
          />
          <path
            d="M19.39 12.63c-.04-3.08 2.5-4.53 2.61-4.62-1.43-2.1-3.65-2.38-4.43-2.4-1.87-.19-3.66 1.11-4.62 1.11-.96 0-2.43-1.09-4.01-1.06-2.06.03-3.95 1.2-5.01 3.04-2.14 3.72-.54 9.2 1.54 12.22 1.02 1.46 2.23 3.1 3.82 3.04 1.54-.06 2.12-.98 3.98-.98 1.86 0 2.38.98 4.01.95 1.65-.03 2.7-1.5 3.71-2.97 1.17-1.71 1.65-3.37 1.68-3.46-.04-.02-3.21-1.23-3.24-4.87"
            fill="currentColor"
          />
        </svg>
        {isLoading ? "Connecting..." : "Continue with Apple"}
      </button> */}

      {/* Facebook Sign-In Button */}
      {/* <button
        onClick={() => handleSignIn("facebook")}
        disabled={isLoading}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-white dark:ring-zinc-700 dark:hover:bg-zinc-700"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Facebook</title>
          <path
            d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
            fill="#1877F2"
          />
        </svg>
        {isLoading ? "Connecting..." : "Continue with Facebook"}
      </button> */}
    </div>
  );
}

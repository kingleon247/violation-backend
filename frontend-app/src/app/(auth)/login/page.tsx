import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@lib/auth";

import { Logo } from "@app/logo";
import { Heading } from "@components/catalyst/heading";
import { Text, TextLink, Strong } from "@components/catalyst/text";
import SignIn from "@components/sign-in";

export const metadata: Metadata = { title: "Login" };

export default async function Login() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    const role = (session.user as any).role ?? "pending";
    if (role === "admin") redirect("/admin/dashboard");
    redirect("/dashboard");
  }

  return (
    <div className="grid w-full max-w-sm grid-cols-1 gap-8">
      <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
      <Heading>Sign in to your account</Heading>

      {/* Your existing Google button client component */}
      <SignIn />

      <Text>
        Don’t have an account?{" "}
        <TextLink href="/register">
          <Strong>Request access</Strong>
        </TextLink>
      </Text>
    </div>
  );
}

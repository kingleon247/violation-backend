// app/components/_/login/Logo.tsx

import logo from "@/public/img/bff-handyman-logo-32.png";

import Image from "next/image";

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src={logo}
      //   src="/img/bff-handyman-logo-32"
      alt="Logo"
      width={40}
      height={40}
      quality={100}
      unoptimized={true}
      className={className}
    />
  );
}

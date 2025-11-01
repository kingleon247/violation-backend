import Link from "next/link";
import clsx from "clsx";

// Define base styles for the button
const baseStyles: Record<string, string> = {
  solid:
    "group inline-flex items-center justify-center rounded-full py-2 px-4 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2",
  outline:
    "group inline-flex ring-1 items-center justify-center rounded-full py-2 px-4 text-sm focus:outline-none",
};

// Define variant styles for the button
const variantStyles: Record<"solid" | "outline", Record<string, string>> = {
  solid: {
    white:
      "bg-white text-slate-900 hover:bg-blue-50 active:bg-blue-200 active:text-slate-600 focus-visible:outline-white",
    red: "bg-red-500 text-white hover:bg-red-400 hover:text-red-100 active:bg-red-800 active:text-red-300 focus-visible:outline-red-900",
    blue: "bg-blue-600 text-white hover:text-slate-100 hover:bg-blue-500 active:bg-blue-800 active:text-blue-100 focus-visible:outline-blue-600",
    green:
      "bg-green-500 text-white hover:bg-green-400 hover:text-green-100 active:bg-green-800 active:text-green-300 focus-visible:outline-green-900",
    slate:
      "bg-slate-900 text-white hover:bg-slate-900 hover:text-slate-100 active:bg-slate-800 active:text-slate-300 focus-visible:outline-slate-900",
  },
  outline: {
    white:
      "ring-white-200 text-white-700 hover:text-white-900 hover:ring-white-300 active:bg-white-100 active:text-white-600 focus-visible:outline-blue-600 focus-visible:ring-white-300",
    red: "ring-red-200 text-red-700 hover:text-red-900 hover:ring-red-300 active:bg-red-100 active:text-red-600 focus-visible:outline-blue-600 focus-visible:ring-red-300",
    green:
      "ring-green-200 text-green-700 hover:text-green-900 hover:ring-green-300 active:bg-green-100 active:text-green-600 focus-visible:outline-blue-600 focus-visible:ring-green-300",
    slate:
      "ring-slate-200 text-slate-900 hover:text-slate-900 hover:ring-slate-300 active:bg-slate-100 active:text-slate-600 focus-visible:outline-blue-600 focus-visible:ring-slate-300",
  },
};

// Define props for the Button component
interface ButtonProps {
  variant?: "solid" | "outline";
  color?: keyof (typeof variantStyles)["solid"];
  className?: string;
  href?: string | null;
  [key: string]: any; // Accept other props like onClick
}

export function Button({
  variant = "solid",
  color = "slate",
  className,
  href = null,
  ...props
}: ButtonProps) {
  const buttonClassName = clsx(
    baseStyles[variant],
    variantStyles[variant][color],
    className
  );

  return href ? (
    <Link href={href} className={buttonClassName} {...props}>
      {props.children}
    </Link>
  ) : (
    <button className={buttonClassName} {...props}>
      {props.children}
    </button>
  );
}

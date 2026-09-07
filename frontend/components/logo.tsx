export function Logo({
  variant = "full",
  className = "",
}: {
  variant?: "full" | "simple";
  className?: string;
}) {
  const light = variant === "simple" ? "/simple-light.svg" : "/light.svg";
  const dark = variant === "simple" ? "/simple-dark.svg" : "/dark.svg";
  return (
    <>
      <Image
        src={light}
        width={160}
        height={40}
        alt="Kenoma"
        className={`block dark:hidden ${className}`}
      />
      <Image
        src={dark}
        width={160}
        height={40}
        alt="Kenoma"
        className={`hidden dark:block ${className}`}
      />
    </>
  );
}
import Image from "next/image";

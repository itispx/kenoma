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
      <img src={light} alt="Kenoma" className={`block dark:hidden ${className}`} />
      <img src={dark} alt="Kenoma" className={`hidden dark:block ${className}`} />
    </>
  );
}

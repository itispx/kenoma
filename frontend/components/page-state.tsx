export const notFoundCopy = "Not found or you do not have access.";
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="surface-panel p-gutter-lg text-sm text-console-300">
      {label}
    </div>
  );
}
export function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="surface-panel border-signal-error/50 p-gutter-lg text-sm text-signal-error"
    >
      {message}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-widest text-console-400">
          {eyebrow}
        </div>
        <h1 className="font-heading text-xl font-semibold">{title}</h1>
      </div>
      {action}
    </div>
  );
}

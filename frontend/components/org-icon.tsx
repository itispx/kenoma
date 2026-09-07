import { Building2, User } from "lucide-react";

// A personal space and a shared organization are different kinds of place, so
// they never wear the same mark. Kept in one component because the pairing
// shows up in the switcher, the dashboard, and anywhere a workspace is named.
export function OrgIcon({
  isPersonal,
  className,
}: {
  isPersonal: boolean;
  className?: string;
}) {
  const Icon = isPersonal ? User : Building2;
  return <Icon className={className} aria-hidden />;
}

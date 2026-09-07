import type { OrgRole } from "@/lib/types";

// One ordering, one set of labels. The two role pickers used to hard-code
// these inline and list them in opposite orders, so the same choice read
// differently on the invitations page and the members page.
export const ORG_ROLE_OPTIONS: readonly { value: OrgRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

export const orgRoleLabel = (role: OrgRole) =>
  ORG_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;

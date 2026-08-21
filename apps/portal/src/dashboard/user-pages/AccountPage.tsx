import { useNavigate } from "react-router-dom";
import { changeUserPassword, updateUserProfile } from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { AccountSettings } from "../components/AccountSettings";

const ROLE_LABEL: Record<string, string> = {
  org_admin: "Organization admin",
  supervisor: "Supervisor",
  agent: "Member",
};

export default function UserAccountPage() {
  const { user, logout, refresh } = useUserAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const orgName = user.organization?.name || user.organization?.slug || "Organization";
  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <AccountSettings
      title="Account"
      description="Your identity, workspace membership, and sign-in security."
      displayName={user.name}
      email={user.email}
      roleLabel={ROLE_LABEL[user.role] ?? user.role}
      statusActive={user.isActive}
      memberSince={user.createdAt}
      workspace={{
        name: orgName,
        slug: user.organization?.slug || "—",
        id: user.organization.id,
      }}
      details={[
        { label: "User ID", value: user.id, mono: true, copy: true },
        ...(user.updatedAt
          ? [{ label: "Profile updated", value: formatDateTime(user.updatedAt) }]
          : []),
      ]}
      onSaveName={async (name) => {
        await updateUserProfile({ name });
        await refresh();
      }}
      onChangePassword={changeUserPassword}
      onLogout={handleLogout}
      onUnauthorized={handleLogout}
    />
  );
}

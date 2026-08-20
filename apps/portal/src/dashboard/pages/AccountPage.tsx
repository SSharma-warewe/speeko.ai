import { useNavigate } from "react-router-dom";
import { changeAdminPassword, updateAdminProfile } from "../../lib/api";
import { useAdminAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { AccountSettings } from "../components/AccountSettings";

export default function AdminAccountPage() {
  const { admin, logout, refresh } = useAdminAuth();
  const navigate = useNavigate();

  if (!admin) return null;

  const handleLogout = () => {
    logout();
    navigate("/admin-login", { replace: true });
  };

  return (
    <AccountSettings
      eyebrow="Platform"
      title="Account"
      description="Your platform admin identity and sign-in security."
      displayName={admin.name}
      email={admin.email}
      roleLabel="Platform admin"
      statusActive={admin.isActive}
      memberSince={admin.createdAt}
      details={[
        { label: "Email", value: admin.email },
        { label: "Admin ID", value: admin.id, mono: true, copy: true },
        { label: "Role", value: "Platform admin" },
        { label: "Profile updated", value: formatDateTime(admin.updatedAt) },
      ]}
      onSaveName={async (name) => {
        await updateAdminProfile({ name });
        await refresh();
      }}
      onChangePassword={changeAdminPassword}
      onLogout={handleLogout}
      onUnauthorized={handleLogout}
    />
  );
}

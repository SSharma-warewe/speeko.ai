import { changeUserPassword } from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { ChangePasswordForm } from "../pages/AccountPage";

export default function UserAccountPage() {
  const { logout } = useUserAuth();
  return (
    <ChangePasswordForm
      title="Account"
      description="Update the password for your organization login."
      onSubmit={changeUserPassword}
      onUnauthorized={logout}
    />
  );
}

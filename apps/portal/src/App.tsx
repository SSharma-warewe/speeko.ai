import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin, RequireUser } from "./lib/auth";
import DashboardLayout from "./dashboard/DashboardLayout";
import UserDashboardLayout from "./dashboard/UserDashboardLayout";
import OverviewPage from "./dashboard/pages/OverviewPage";
import OrganizationsListPage from "./dashboard/pages/OrganizationsListPage";
import OrganizationDetailPage from "./dashboard/pages/OrganizationDetailPage";
import OrgOverviewTab from "./dashboard/pages/OrgOverviewTab";
import OrgUsersPage from "./dashboard/pages/OrgUsersPage";
import OrgAgentsPage from "./dashboard/pages/OrgAgentsPage";
import OrgAgentDetailPage from "./dashboard/pages/OrgAgentDetailPage";
import OrgSipTrunksPage from "./dashboard/pages/OrgSipTrunksPage";
import OrgQueuePage from "./dashboard/pages/OrgQueuePage";
import AgentTemplatesPage from "./dashboard/pages/AgentTemplatesPage";
import AgentTemplateDetailPage from "./dashboard/pages/AgentTemplateDetailPage";
import ToolProfilesPage from "./dashboard/pages/ToolProfilesPage";
import CallsListPage from "./dashboard/pages/CallsListPage";
import CallDetailPage from "./dashboard/pages/CallDetailPage";
import UserOverviewPage from "./dashboard/user-pages/OverviewPage";
import UserAgentsPage from "./dashboard/user-pages/AgentsPage";
import UserAgentDetailPage from "./dashboard/user-pages/AgentDetailPage";
import UserQueuePage from "./dashboard/user-pages/QueuePage";
import UserBatchesPage from "./dashboard/user-pages/BatchesPage";
import UserBatchDetailPage from "./dashboard/user-pages/BatchDetailPage";
import UserCallsPage from "./dashboard/user-pages/CallsPage";
import UserCallDetailPage from "./dashboard/user-pages/CallDetailPage";
import UserEnqueuePage from "./dashboard/user-pages/EnqueuePage";
import UserDialNowPage from "./dashboard/user-pages/DialNowPage";
import UserSipTrunksPage from "./dashboard/user-pages/SipTrunksPage";
import UserToolProfilesPage from "./dashboard/user-pages/ToolProfilesPage";
import UserIntegrationsPage from "./dashboard/user-pages/IntegrationsPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import UserLoginPage from "./pages/UserLoginPage";

export default function App() {
  return (
    <Routes>
      <Route path="/admin-login" element={<AdminLoginPage />} />
      <Route path="/login" element={<UserLoginPage />} />

      {/* Org-user ops dashboard */}
      <Route
        path="/dashboard"
        element={
          <RequireUser>
            <UserDashboardLayout />
          </RequireUser>
        }
      >
        <Route index element={<UserOverviewPage />} />
        <Route path="enqueue" element={<UserEnqueuePage />} />
        <Route path="dial" element={<UserDialNowPage />} />
        <Route path="calls" element={<UserCallsPage />} />
        <Route path="calls/:id" element={<UserCallDetailPage />} />
        <Route path="batches" element={<UserBatchesPage />} />
        <Route path="batches/:id" element={<UserBatchDetailPage />} />
        <Route path="agents" element={<UserAgentsPage />} />
        <Route path="agents/:id" element={<UserAgentDetailPage />} />
        <Route path="queue" element={<UserQueuePage />} />
        <Route path="sip" element={<UserSipTrunksPage />} />
        <Route path="tool-profiles" element={<UserToolProfilesPage />} />
        <Route path="integrations" element={<UserIntegrationsPage />} />
      </Route>

      {/* Platform admin dashboard */}
      <Route
        path="/admin-dashboard"
        element={
          <RequireAdmin>
            <DashboardLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="organizations" element={<OrganizationsListPage />} />
        <Route path="organizations/:orgId" element={<OrganizationDetailPage />}>
          <Route index element={<OrgOverviewTab />} />
          <Route path="users" element={<OrgUsersPage />} />
          <Route path="agents" element={<OrgAgentsPage />} />
          <Route path="agents/:agentId" element={<OrgAgentDetailPage />} />
          <Route path="sip-trunks" element={<OrgSipTrunksPage />} />
          <Route path="queue" element={<OrgQueuePage />} />
        </Route>
        <Route path="agents" element={<AgentTemplatesPage />} />
        <Route path="agents/:id" element={<AgentTemplateDetailPage />} />
        <Route path="tool-profiles" element={<ToolProfilesPage />} />
        <Route path="calls" element={<CallsListPage />} />
        <Route path="calls/:id" element={<CallDetailPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

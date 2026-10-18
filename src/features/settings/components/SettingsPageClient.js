"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, UserPlus } from "lucide-react";
import "@/components/settings/settings.css";
import PermissionGate from "@/components/PermissionGate";
import { adminFetch } from "@/lib/adminClient";
import { buildPermissionGroups } from "@/lib/permissionGroups";
import { usePermissions } from "@/lib/usePermissions";

const AuditLogPanel = dynamic(() => import("@/components/settings/AuditLogPanel"), {
  loading: () => null,
});
const CreateUserForm = dynamic(() => import("@/components/settings/CreateUserForm"), {
  loading: () => null,
});
const LineApproverLinksPanel = dynamic(() => import("@/components/settings/LineApproverLinksPanel"), {
  loading: () => null,
});
const RolePermissionsForm = dynamic(() => import("@/components/settings/RolePermissionsForm"), {
  loading: () => null,
});
const UserManagementPanel = dynamic(() => import("@/components/settings/UserManagementPanel"), {
  loading: () => null,
});
const toSlug = (value) => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
);

const toRoleKey = (value) => {
  const slug = toSlug(value);
  return slug || `role-${Date.now()}`;
};

const DEFAULT_DEPARTMENTS = [];

const SETTINGS_TABS = [
  {
    id: "logs",
    label: "LOG",
    description: "ติดตามเหตุการณ์การใช้งานระบบ",
    icon: AlertCircle,
    adminOnly: true,
    items: [
      {
        id: "audit-logs",
        label: "LOG",
        description: "ประวัติการทำงานและการเปลี่ยนแปลง",
        content: "audit-logs",
        adminOnly: true,
      },
    ],
  },
  {
    id: "users",
    label: "ผู้ใช้งาน",
    description: "จัดการผู้ใช้ สิทธิ์ และโครงสร้างการเข้าถึง",
    icon: UserPlus,
    items: [
      {
        id: "users-create",
        label: "สร้างผู้ใช้ใหม่",
        description: "เพิ่มผู้ใช้และกำหนดบทบาทเบื้องต้น",
        content: "users",
      },
      {
        id: "roles-permissions",
        label: "บทบาทและสิทธิ์",
        description: "กำหนดสิทธิ์การใช้งานตามบทบาท",
        content: "roles",
      },
      {
        id: "user-management",
        label: "จัดการผู้ใช้",
        description: "แก้ไขข้อมูลผู้ใช้และสถานะการใช้งาน",
        content: "user-management",
        adminOnly: true,
      },
      {
        id: "line-approvers",
        label: "อนุมัติ LINE",
        description: "ตั้งค่ารหัสอนุมัติสำหรับแจ้งเตือน LINE",
        content: "line-approvers",
        adminOnly: true,
      },
    ],
  },
];

function SettingsPageContent() {
  const permissionState = usePermissions();
  const [activeTab, setActiveTab] = useState("users");
  const [activeSubTab, setActiveSubTab] = useState("users-create");
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [taskPermissionsEnabled, setTaskPermissionsEnabled] = useState(false);
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [permissionDraft, setPermissionDraft] = useState({ dirty: false, busy: false });

  function switchSection(tabId, itemId) {
    if (activeSubTab === itemId || permissionDraft.busy) return;
    if (permissionDraft.dirty && !window.confirm("มีสิทธิ์ที่ยังไม่บันทึก ต้องการละทิ้งการเปลี่ยนแปลงหรือไม่?")) return;
    setActiveTab(tabId);
    setActiveSubTab(itemId);
  }

  useEffect(() => {
    let isActive = true;
    const loadAccessData = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const [rolesResponse, permissionsResponse, departmentsResponse] = await Promise.all([
          adminFetch("/api/admin/roles"),
          adminFetch("/api/admin/permissions"),
          adminFetch("/api/admin/departments?sync_hr=1"),
        ]);
        if (!isActive) return;
        setRoles(rolesResponse.roles ?? []);
        setPermissions(permissionsResponse.permissions ?? []);
        setTaskPermissionsEnabled(permissionsResponse.task_permissions_enabled === true);
        const activeDepartments = (departmentsResponse.departments ?? []).filter(
          (dept) => dept.is_active !== false
        );
        setDepartments(activeDepartments);
      } catch (error) {
        if (!isActive) return;
        setLoadError(error?.message ?? "โหลดข้อมูลการตั้งค่าไม่สำเร็จ");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadAccessData();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!permissionState.loaded) {
      return;
    }
    if (!permissionState.isAdmin && activeSubTab === "user-management") {
      setActiveSubTab("users-create");
    }
  }, [activeSubTab, permissionState.isAdmin, permissionState.loaded]);

  const availableTabs = useMemo(
    () => SETTINGS_TABS.filter((tab) => !tab.adminOnly || permissionState.isAdmin),
    [permissionState.isAdmin]
  );

  useEffect(() => {
    const nextTab = availableTabs.find((tab) => tab.id === activeTab) || availableTabs[0];
    if (!nextTab) {
      return;
    }
    const visibleItems = nextTab.items.filter(
      (item) => !item.adminOnly || permissionState.isAdmin
    );
    const hasSubTab = visibleItems.some((item) => item.id === activeSubTab);
    if (!hasSubTab) {
      const firstEnabled = visibleItems.find((item) => !item.disabled);
      if (firstEnabled) {
        setActiveSubTab(firstEnabled.id);
      }
    }
  }, [activeSubTab, activeTab, availableTabs, permissionState.isAdmin]);

  const handleAddDepartment = async (name) => {
    const normalized = name.trim();
    if (!normalized) {
      return "";
    }
    const response = await adminFetch("/api/admin/departments", {
      method: "POST",
      body: JSON.stringify({ name: normalized }),
    });
    const department = response.department;
    if (!department) {
      return "";
    }
    setDepartments((current) => {
      if (current.some((dept) => dept.id === department.id)) {
        return current;
      }
      return [...current, department];
    });
    return department.id;
  };

  const handleSaveRole = async (role) => {
    const trimmedName = role.name.trim();
    if (role.id) {
      await adminFetch(`/api/admin/roles/${role.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: trimmedName,
          permission_ids: role.permissions,
          expected_permission_ids: role.expectedPermissions,
        }),
      });
    } else {
      const roleKey = toRoleKey(trimmedName);
      await adminFetch("/api/admin/roles", {
        method: "POST",
        body: JSON.stringify({
          role_key: roleKey,
          name: trimmedName,
          permission_ids: role.permissions,
        }),
      });
    }
    const rolesResponse = await adminFetch("/api/admin/roles");
    setRoles(rolesResponse.roles ?? []);
  };

  const handleDeleteRole = async (roleId) => {
    await adminFetch(`/api/admin/roles/${roleId}`, { method: "DELETE" });
    const rolesResponse = await adminFetch("/api/admin/roles");
    setRoles(rolesResponse.roles ?? []);
  };

  const handleCreateUser = async (payload) => (
    adminFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: payload.username,
        password: payload.password,
        role_id: payload.roleId,
        department_id: payload.departmentId || null,
      }),
    })
  );

  const roleOptions = useMemo(
    () => roles.map((role) => ({ id: role.id, name: role.name })),
    [roles]
  );
  const permissionGroups = useMemo(
    () => buildPermissionGroups(permissions),
    [permissions]
  );

  const activeTabConfig =
    availableTabs.find((tab) => tab.id === activeTab) || availableTabs[0];
  const activeSubTabConfig = activeTabConfig?.items.find(
    (item) => item.id === activeSubTab
  );

  return (
    <div className="settings-main-container flex min-h-0 w-full min-w-0 bg-[#ffffff] text-[#1e293b] font-sans">
      {/* 2. Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#ffffff]">
        <header className="settings-page-header">
          <h1>ตั้งค่าระบบ</h1>
          <nav className="settings-horizontal-tabs" aria-label="ส่วนตั้งค่าระบบ">
            {[...availableTabs].sort((a, b) => a.id === "users" ? -1 : b.id === "users" ? 1 : 0).flatMap((tab) => tab.items.filter((item) => !item.adminOnly || permissionState.isAdmin).map((item) => (
              <button key={item.id} type="button" aria-pressed={activeSubTab === item.id}
                onClick={() => switchSection(tab.id, item.id)}>
                {item.content === "audit-logs" ? "ประวัติการใช้งาน" : item.label}
              </button>
            )))}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto p-5 bg-[#f7f9fc] settings-scrollbar">
          <div className="w-full mx-auto">
            {loadError && (
              <div className="mb-6 rounded-[2px] border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle size={14} />
                {loadError}
              </div>
            )}

            <div className="bg-white border border-[#e2e8f0] p-4 rounded-[4px]">
              {!activeSubTabConfig || activeSubTabConfig.disabled ? (
                <div className="border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center rounded-[2px]">
                  <p className="text-sm font-bold text-[#102C57] uppercase tracking-wider">
                    ไม่พบเมนูที่เข้าถึงได้
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบสิทธิ์การใช้งาน
                  </p>
                </div>
              ) : activeSubTabConfig.content === "users" ? (
                <CreateUserForm
                  roles={roleOptions}
                  departments={departments}
                  onAddDepartment={handleAddDepartment}
                  onCreateUser={handleCreateUser}
                  isLoading={isLoading}
                />
              ) : activeSubTabConfig.content === "roles" ? (
                <RolePermissionsForm
                  taskPermissionsEnabled={taskPermissionsEnabled}
                  onDraftChange={setPermissionDraft}
                  roles={roles}
                  permissionGroups={permissionGroups}
                  onSaveRole={handleSaveRole}
                  onDeleteRole={handleDeleteRole}
                  isLoading={isLoading}
                />
              ) : activeSubTabConfig.content === "line-approvers" ? (
                <LineApproverLinksPanel />
              ) : activeSubTabConfig.content === "audit-logs" ? (
                <AuditLogPanel />
              ) : (
                <UserManagementPanel
                  roles={roleOptions}
                  departments={departments}
                  isLoading={isLoading}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <PermissionGate requireAdmin>
      <SettingsPageContent />
    </PermissionGate>
  );
}





"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Menu, Settings, UserPlus, X } from "lucide-react";
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

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
    <div className="settings-main-container flex h-screen w-screen overflow-hidden bg-[#ffffff] text-[#1e293b] font-sans">
      <style dangerouslySetInnerHTML={{ __html: `
        /* Premium custom CSS overrides for settings forms and panels */
        .settings-main-container {
          --color-navy: #102C57;
          --color-dark-navy: #0A1931;
          --color-gold: #d4af37;
          --color-gold-light: #fdf7e6;
          --color-border: #e2e8f0;
          --color-text-main: #181818;
          --color-text-muted: #666666;
        }

        .settings-main-container,
        .settings-main-container input,
        .settings-main-container select,
        .settings-main-container textarea,
        .settings-main-container button {
          font-family: var(--font-sans), system-ui, sans-serif !important;
        }

        /* Override border radius of all components inside settings page */
        .settings-main-container .rounded-2xl,
        .settings-main-container .rounded-xl,
        .settings-main-container .rounded-lg,
        .settings-main-container .rounded-md,
        .settings-main-container input,
        .settings-main-container select,
        .settings-main-container textarea,
        .settings-main-container button {
          border-radius: 2px !important;
        }

        /* Remove heavy box shadows for flat architectural look */
        .settings-main-container .shadow-sm,
        .settings-main-container .shadow-md,
        .settings-main-container .shadow-lg,
        .settings-main-container .shadow-xl {
          box-shadow: none !important;
          border: 1px solid var(--color-border) !important;
        }

        /* Custom Input styling */
        .settings-main-container input,
        .settings-main-container select,
        .settings-main-container textarea {
          border: 1px solid #cbd5e1 !important;
          background-color: #ffffff !important;
          color: var(--color-text-main) !important;
          transition: border-color 0.2s, box-shadow 0.2s !important;
        }
        .settings-main-container input:focus,
        .settings-main-container select:focus,
        .settings-main-container textarea:focus {
          border-color: var(--color-gold) !important;
          outline: none !important;
          box-shadow: 0 0 0 1px var(--color-gold) !important;
        }

        /* Custom Button styling */
        .settings-main-container button.bg-\[\#102C57\],
        .settings-main-container button.bg-slate-900,
        .settings-main-container button.bg-slate-800 {
          background-color: var(--color-navy) !important;
          color: #ffffff !important;
          border: 1px solid var(--color-navy) !important;
          transition: all 0.2s !important;
        }
        .settings-main-container button.bg-\[\#102C57\]:hover,
        .settings-main-container button.bg-slate-900:hover,
        .settings-main-container button.bg-slate-800:hover {
          background-color: var(--color-gold) !important;
          color: var(--color-navy) !important;
          border-color: var(--color-gold) !important;
        }

        .settings-main-container button.bg-\[\#d4af37\] {
          background-color: var(--color-gold) !important;
          color: var(--color-navy) !important;
          border: 1px solid var(--color-gold) !important;
          transition: all 0.2s !important;
        }
        .settings-main-container button.bg-\[\#d4af37\]:hover {
          background-color: var(--color-navy) !important;
          color: #ffffff !important;
          border-color: var(--color-navy) !important;
        }

        .settings-main-container button.border-gray-300,
        .settings-main-container button.border-slate-200 {
          border-color: #cbd5e1 !important;
          color: var(--color-text-main) !important;
        }
        .settings-main-container button.border-gray-300:hover,
        .settings-main-container button.border-slate-200:hover {
          background-color: var(--color-gold-light) !important;
          border-color: var(--color-gold) !important;
          color: var(--color-navy) !important;
        }

        /* Custom Scrollbar for sidebar and content */
        .settings-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .settings-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .settings-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(212, 175, 55, 0.2);
          border-radius: 3px;
        }
        .settings-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--color-gold);
        }

        /* Sidebar active link styling */
        .sidebar-link-active {
          background-color: var(--color-gold-light) !important;
          color: var(--color-navy) !important;
          border-left: 3px solid var(--color-gold) !important;
          font-weight: 700 !important;
        }
      ` }} />

      {/* Sidebar Backdrop Overlay on Mobile */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 md:hidden animate-fade-in"
        />
      )}

      {/* 1. Deep Navy Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-[#0A1931] text-white flex flex-col h-full shrink-0 border-r border-[#d4af37]/20 select-none transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        {/* Sidebar Brand Header */}
        <div className="p-6 border-b border-[#d4af37]/10 flex flex-col items-center text-center relative">
          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden absolute top-4 right-4 p-1.5 text-white/50 hover:text-white transition"
          >
            <X size={18} />
          </button>
          
          <div className="w-12 h-12 flex items-center justify-center bg-[#d4af37] text-[#0A1931] rounded-[2px] mb-3 shadow-[0_4px_12px_rgba(212,175,55,0.2)]">
            <Settings className="w-6 h-6 stroke-[2.5]" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#d4af37] mb-1">
            System Configuration
          </span>
          <h2 className="text-lg font-bold text-white tracking-wide">ตั้งค่าระบบ</h2>
          <span className="text-[9px] text-white/50 tracking-wider mt-0.5">บริษัท เคพีฟู้ดส์ จำกัด</span>
        </div>

        {/* Sidebar Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-6 settings-scrollbar">
          {availableTabs.map((tab) => {
            const visibleSubItems = tab.items.filter(
              (item) => !item.adminOnly || permissionState.isAdmin
            );
            if (!visibleSubItems.length) return null;

            return (
              <div key={tab.id} className="space-y-2">
                <span className="block px-3 text-[10px] font-black uppercase tracking-[0.15em] text-[#d4af37]/70">
                  {tab.label}
                </span>
                <div className="space-y-1">
                  {visibleSubItems.map((item) => {
                    const isActive = item.id === activeSubTab;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (item.disabled) return;
                          setActiveTab(tab.id);
                          setActiveSubTab(item.id);
                          setIsSidebarOpen(false); // Close sidebar on selection (mobile)
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs tracking-wide transition-all duration-150 border-l-[3px] border-l-transparent rounded-[2px] group ${
                          isActive
                            ? "sidebar-link-active"
                            : "text-white/70 hover:text-white hover:bg-white/5 hover:border-l-[#d4af37]/50"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="block font-bold truncate">{item.label}</span>
                          <span className={`block text-[10px] truncate ${isActive ? 'text-[#102C57]/70' : 'text-white/40'}`}>
                            {item.description}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer Stats */}
        <div className="p-4 border-t border-[#d4af37]/10 bg-black/20 text-center flex items-center justify-around text-[11px] text-white/60">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#d4af37]">{roles.length}</span>
            <span className="text-[9px] uppercase tracking-wider text-white/40">บทบาท</span>
          </div>
          <div className="h-6 w-px bg-[#d4af37]/10" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#d4af37]">{departments.length}</span>
            <span className="text-[9px] uppercase tracking-wider text-white/40">แผนก</span>
          </div>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-[#ffffff]">
        {/* Content Header */}
        <header className="px-6 md:px-8 py-5 border-b border-[#e2e8f0] flex items-center justify-between bg-white select-none gap-4">
          <div className="flex items-center gap-3">
            {/* Hamburger Toggle Button for Mobile */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-1.5 border border-slate-200 hover:bg-slate-50 text-[#102C57] transition rounded-[2px] shrink-0"
            >
              <Menu size={18} />
            </button>
            
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#d4af37]">
                  {activeTabConfig?.label}
                </span>
                <span className="text-slate-300">/</span>
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#102C57]">
                  {activeSubTabConfig?.label}
                </span>
              </div>
              <h1 className="text-lg md:text-xl font-black text-[#102C57] mt-0.5 tracking-wide">
                {activeSubTabConfig?.label}
              </h1>
              <p className="hidden sm:block text-xs text-[#666666] mt-0.5">
                {activeSubTabConfig?.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="hidden sm:inline">เชื่อมต่อเซิร์ฟเวอร์เสร็จสิ้น</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 bg-[#fafafb] settings-scrollbar">
          <div className="max-w-5xl mx-auto">
            {loadError && (
              <div className="mb-6 rounded-[2px] border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle size={14} />
                {loadError}
              </div>
            )}

            <div className="bg-white border border-[#e2e8f0] p-6 sm:p-8 rounded-[2px]">
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





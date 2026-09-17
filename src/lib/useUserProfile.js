"use client";

import { useEffect, useState } from "react";

export function useUserProfile() {
  const [profile, setProfile] = useState({
    username: "",
    department: "",
    loaded: false,
  });

  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      try {
        const response = await fetch("/api/auth/profile", {
          cache: "no-store",
          credentials: "include",
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "ไม่พบโปรไฟล์ผู้ใช้");
        }
        if (!isMounted) return;
        setProfile({
          username: payload?.profile?.username ?? "",
          department: payload?.profile?.department ?? "",
          loaded: true,
        });
      } catch (error) {
        if (!isMounted) return;
        setProfile((prev) => ({ ...prev, loaded: true }));
      }
    };
    loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  return profile;
}

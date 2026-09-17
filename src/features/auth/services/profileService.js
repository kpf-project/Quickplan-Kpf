import { ApiError, getSupabaseAdmin, requireUser } from "@/lib/adminApi";

export async function handleProfile(request) {
  const { userId } = await requireUser(request);
  const supabaseAdmin = getSupabaseAdmin();

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("username, department_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new ApiError(500, "Failed to load profile", profileError.message);
  }

  let department = null;
  if (profile?.department_id) {
    const { data: dept, error: deptError } = await supabaseAdmin
      .from("departments")
      .select("name")
      .eq("id", profile.department_id)
      .maybeSingle();
    if (deptError) {
      throw new ApiError(500, "Failed to load department", deptError.message);
    }
    department = dept ?? null;
  }

  return Response.json({
    profile: {
      username: profile?.username ?? null,
      department: department?.name ?? null,
    },
  });
}

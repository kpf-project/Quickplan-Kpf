import { getSupabaseAdmin } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  
  // Check if admin role exists
  const { data: existing, error: checkError } = await supabaseAdmin
    .from("roles")
    .select("*")
    .eq("role_key", "admin")
    .maybeSingle();

  if (checkError) {
    return Response.json({ error: checkError.message }, { status: 500 });
  }

  if (existing) {
    return Response.json({ message: "Admin role already exists", role: existing });
  }

  // Create admin role if missing
  const { data: created, error: createError } = await supabaseAdmin
    .from("roles")
    .insert({
      role_key: "admin",
      name: "Admin",
      description: "System administrator",
      is_system: true,
    })
    .select()
    .single();

  if (createError) {
    return Response.json({ error: createError.message }, { status: 500 });
  }

  return Response.json({ message: "Admin role created", role: created });
}

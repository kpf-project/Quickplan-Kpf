import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const dynamic = 'force-dynamic';

let cachedCategories = null;
let cachedCategoriesExpiry = 0;
const CATEGORIES_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function invalidateCategoriesCache() {
    cachedCategories = null;
    cachedCategoriesExpiry = 0;
}

export async function GET(request) {
    try {
        await requirePermissionKeys(request, [
            "production-line-bom-view",
            "production-line-bom-manage",
        ]);

        if (cachedCategories && Date.now() < cachedCategoriesExpiry) {
            return Response.json({ data: cachedCategories });
        }

        const supabaseAdmin = getSupabaseAdmin();

        // Use a distinct query to get all used categories
        // Note: Supabase/PostgREST distinct support: .select('col', { distinct: true })? 
        // Actually simple distinct on specific columns might send too much data if not careful, 
        // but here we just want distinct iccat_code, iccat_name.
        // However, duplicate codes might have different names? Use maybe arbitrary name.

        // Efficient way:
        // .select('iccat_code, iccat_name')
        // javascript distinct. 
        // Because products_cache might be large (10k), downloading just these 2 columns is fine (approx 200KB).

        const { data, error } = await supabaseAdmin
            .from("products_cache")
            .select("iccat_code, iccat_name");

        if (error) {
            return Response.json({ error: "Failed to load categories" }, { status: 500 });
        }

        // Process in JS to get unique items
        const map = new Map();
        (data ?? []).forEach((item) => {
            if (item.iccat_code && !map.has(item.iccat_code)) {
                map.set(item.iccat_code, item.iccat_name || item.iccat_code);
            }
        });

        // Convert map to array and sort
        const categories = Array.from(map.entries())
            .map(([code, name]) => ({ code, name }))
            .sort((a, b) => a.code.localeCompare(b.code));

        cachedCategories = categories;
        cachedCategoriesExpiry = Date.now() + CATEGORIES_CACHE_TTL_MS;

        return Response.json({ data: categories });
    } catch (error) {
        return jsonError(error);
    }
}

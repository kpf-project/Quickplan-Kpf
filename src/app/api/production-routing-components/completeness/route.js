import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function deriveItemType(iccatCode) {
  const normalized = normalizeCode(iccatCode);
  if (normalized === "03") return "WIP";
  if (normalized === "04" || normalized === "04-1" || normalized === "04-2") return "PACK";
  return "RAW";
}

function pickActiveVersion(versions = []) {
  if (!versions.length) return null;
  const latest = versions[0];
  if (latest.status !== "rejected") return latest;
  return versions.find((row) => row.status !== "rejected") || latest;
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-view",
      "production-line-settings-manage",
    ]);

    const { searchParams } = new URL(request.url);
    const departmentId = normalizeParam(searchParams.get("departmentId"));
    if (!departmentId) {
      return Response.json({ error: "departmentId is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Fetch all BOM headers with pagination
    const boms = [];
    let bomFrom = 0;
    while (true) {
      const { data, error: bomsErr } = await supabaseAdmin
        .from("production_boms")
        .select("id, sku_code")
        .range(bomFrom, bomFrom + 999);
      if (bomsErr) throw bomsErr;
      if (!data || data.length === 0) break;
      boms.push(...data);
      if (data.length < 1000) break;
      bomFrom += 1000;
    }

    if (!boms || boms.length === 0) {
      return Response.json({ data: {} });
    }

    // 2. Fetch active formulas
    const { data: formulas, error: formulasErr } = await supabaseAdmin
      .from("production_bom_formulas")
      .select("bom_id, formula_code")
      .eq("is_active", true);
    if (formulasErr) throw formulasErr;

    const bomIdToFormulas = new Map();
    (formulas || []).forEach((f) => {
      if (!bomIdToFormulas.has(f.bom_id)) bomIdToFormulas.set(f.bom_id, []);
      bomIdToFormulas.get(f.bom_id).push(f.formula_code);
    });

    // 3. Fetch all versions with pagination (not restricted to 'approved' to match explode logic)
    const versions = [];
    let versFrom = 0;
    while (true) {
      const { data, error: versionsErr } = await supabaseAdmin
        .from("production_bom_versions")
        .select("id, bom_id, version_no, status, formula_code")
        .range(versFrom, versFrom + 999);
      if (versionsErr) throw versionsErr;
      if (!data || data.length === 0) break;
      versions.push(...data);
      if (data.length < 1000) break;
      versFrom += 1000;
    }

    const bomIdToSku = new Map(boms.map((b) => [b.id, normalizeCode(b.sku_code)]));
    const skuToActiveVersionIds = new Map();
    const versionToSku = new Map();
    const bomIdToVersions = new Map();

    (versions || []).forEach((v) => {
      if (!bomIdToVersions.has(v.bom_id)) bomIdToVersions.set(v.bom_id, []);
      bomIdToVersions.get(v.bom_id).push(v);
    });

    const activeVersionIds = [];
    bomIdToVersions.forEach((vers, bomId) => {
      const sku = bomIdToSku.get(bomId);
      if (!sku) return;

      const activeFormulas = bomIdToFormulas.get(bomId) || Array.from(new Set(vers.map((v) => v.formula_code).filter(Boolean)));
      if (activeFormulas.length === 0) {
        activeFormulas.push("DEFAULT");
      }
      const chosenVersionIds = [];

      // Sort descending by version_no
      vers.sort((a, b) => Number(b.version_no || 0) - Number(a.version_no || 0));

      activeFormulas.forEach((code) => {
        const formulaVersions = vers.filter((v) => v.formula_code === code);
        const activeVersion = pickActiveVersion(formulaVersions);
        if (activeVersion) {
          chosenVersionIds.push(activeVersion.id);
          versionToSku.set(activeVersion.id, sku);
          activeVersionIds.push(activeVersion.id);
        }
      });
      skuToActiveVersionIds.set(sku, chosenVersionIds);
    });

    if (activeVersionIds.length === 0) {
      return Response.json({ data: {} });
    }

    // 4. Fetch BOM items in chunks and paginate within each chunk to avoid 1000-row cap
    const VERSION_CHUNK_SIZE = 50;
    const allBomItems = [];
    for (let i = 0; i < activeVersionIds.length; i += VERSION_CHUNK_SIZE) {
      const chunk = activeVersionIds.slice(i, i + VERSION_CHUNK_SIZE);
      let itemFrom = 0;
      while (true) {
        const { data, error } = await supabaseAdmin
          .from("production_bom_items")
          .select("version_id, material_sku_code, material_goods_code")
          .in("version_id", chunk)
          .range(itemFrom, itemFrom + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allBomItems.push(...data);
        if (data.length < 1000) break;
        itemFrom += 1000;
      }
    }

    // 5. Gather unique SKU codes for products cache
    const allSkuCodes = new Set();
    boms.forEach((b) => {
      const code = normalizeCode(b.sku_code);
      if (code) allSkuCodes.add(code);
    });
    allBomItems.forEach((item) => {
      const code = normalizeCode(item.material_sku_code);
      if (code) allSkuCodes.add(code);
    });

    const skuList = Array.from(allSkuCodes);
    const productsMap = new Map();
    const PRODUCT_CHUNK_SIZE = 200;
    for (let i = 0; i < skuList.length; i += PRODUCT_CHUNK_SIZE) {
      const chunk = skuList.slice(i, i + PRODUCT_CHUNK_SIZE);
      const { data, error } = await supabaseAdmin
        .from("products_cache")
        .select("sku_code, iccat_code")
        .in("sku_code", chunk);
      if (error) throw error;
      (data || []).forEach((p) => {
        productsMap.set(normalizeCode(p.sku_code), p.iccat_code);
      });
    }

    // 6. Fetch active routing components for the department with pagination (bypass 1000-row cap)
    const routingComponents = [];
    let rcFrom = 0;
    while (true) {
      const { data, error: routingErr } = await supabaseAdmin
        .from("production_routing_components")
        .select("node_key, fg_sku_code, parent_sku_code, component_sku_code, room_mode, work_center_id, issue_owner_department_id")
        .eq("department_id", departmentId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .range(rcFrom, rcFrom + 999);
      if (routingErr) throw routingErr;
      if (!data || data.length === 0) break;
      routingComponents.push(...data);
      if (data.length < 1000) break;
      rcFrom += 1000;
    }

    const exactMappedComponentsMap = new Map();
    const parentSkuMappedComponentsMap = new Map();
    const skuMappedComponentsMap = new Map();

    (routingComponents || []).forEach((rc) => {
      const fgSku = normalizeCode(rc.fg_sku_code);
      const parentSku = normalizeCode(rc.parent_sku_code);
      const compSku = normalizeCode(rc.component_sku_code);
      const nodeKey = String(rc.node_key || "").trim();

      if (fgSku && nodeKey) {
        exactMappedComponentsMap.set(`${fgSku}::${nodeKey}`, rc);
      }
      if (fgSku && parentSku && compSku) {
        const parentKey = `${fgSku}::${parentSku}::${compSku}`;
        if (!parentSkuMappedComponentsMap.has(parentKey)) {
          parentSkuMappedComponentsMap.set(parentKey, rc);
        }
      }
      if (fgSku && compSku) {
        const skuKey = `${fgSku}::${compSku}`;
        if (!skuMappedComponentsMap.has(skuKey)) {
          skuMappedComponentsMap.set(skuKey, rc);
        }
      }
    });

    const typePriority = {
      RAW: 1,
      PACK: 2,
      WIP: 3,
    };

    const sortBomItems = (a, b) => {
      const typeA = deriveItemType(productsMap.get(normalizeCode(a.material_sku_code)));
      const typeB = deriveItemType(productsMap.get(normalizeCode(b.material_sku_code)));
      const pA = typePriority[typeA] || 99;
      const pB = typePriority[typeB] || 99;
      if (pA !== pB) return pA - pB;
      return String(a.material_sku_code || "").localeCompare(String(b.material_sku_code || ""));
    };

    const versionItemsBySku = new Map();
    allBomItems.forEach((item) => {
      const parentSku = versionToSku.get(item.version_id);
      if (!parentSku) return;
      if (!versionItemsBySku.has(parentSku)) versionItemsBySku.set(parentSku, []);
      versionItemsBySku.get(parentSku).push(item);
    });

    versionItemsBySku.forEach((items, parentSku) => {
      const uniqueItemsMap = new Map();
      items.forEach((item) => {
        const sku = normalizeCode(item.material_sku_code);
        const goods = normalizeCode(item.material_goods_code) || sku;
        const key = `${sku}|${goods}`;
        if (!uniqueItemsMap.has(key)) {
          uniqueItemsMap.set(key, item);
        }
      });
      const deduped = Array.from(uniqueItemsMap.values());
      deduped.sort(sortBomItems);
      versionItemsBySku.set(parentSku, deduped);
    });

    // 6. Perform recursive check for each BOM product
    const completenessMap = {};

    boms.forEach((bom) => {
      const fgSkuCode = normalizeCode(bom.sku_code);
      if (!fgSkuCode) return;

      // If there is no active version for this BOM, then it is incomplete
      const activeVers = skuToActiveVersionIds.get(fgSkuCode) || [];
      if (activeVers.length === 0) {
        completenessMap[fgSkuCode] = {
          isComplete: false,
          totalComponents: 0,
          mappedComponents: 0,
        };
        return;
      }

      const output = [];
      const pathSet = new Set();

      function explodeRecursive(parentSkuCode, parentNodeKey) {
        const directItems = versionItemsBySku.get(parentSkuCode) || [];
        for (let index = 0; index < directItems.length; index += 1) {
          const item = directItems[index];
          const itemSku = normalizeCode(item.material_sku_code);
          const nodeKey = `${parentNodeKey}>${itemSku}#${index + 1}`;
          const iccatCode = productsMap.get(itemSku) || "";
          const itemType = deriveItemType(iccatCode);

          output.push({
            nodeKey,
            parentSkuCode,
            componentSkuCode: itemSku,
            componentType: itemType,
          });

          if (itemType === "WIP") {
            const cycleKey = `${parentSkuCode}->${itemSku}`;
            if (pathSet.has(cycleKey)) continue;
            pathSet.add(cycleKey);
            explodeRecursive(itemSku, nodeKey);
          }
        }
      }

      explodeRecursive(fgSkuCode, fgSkuCode);

      if (output.length === 0) {
        completenessMap[fgSkuCode] = {
          isComplete: false,
          totalComponents: 0,
          mappedComponents: 0,
        };
        return;
      }

      let isComplete = true;
      let mappedComponents = 0;

      for (const component of output) {
        const exactKey = `${fgSkuCode}::${component.nodeKey}`;
        const parentSkuKey = `${fgSkuCode}::${component.parentSkuCode}::${component.componentSkuCode}`;
        const skuKey = `${fgSkuCode}::${component.componentSkuCode}`;

        const mapped = exactMappedComponentsMap.get(exactKey)
          || parentSkuMappedComponentsMap.get(parentSkuKey)
          || skuMappedComponentsMap.get(skuKey);

        if (!mapped) {
          isComplete = false;
          continue;
        }

        const roomMode = mapped.room_mode || "explicit";
        const workCenterId = mapped.work_center_id;
        const issueOwnerDeptId = mapped.issue_owner_department_id || departmentId;

        if (roomMode === "explicit" && !workCenterId) {
          isComplete = false;
          continue;
        }
        if (!issueOwnerDeptId) {
          isComplete = false;
          continue;
        }

        mappedComponents++;
      }

      completenessMap[fgSkuCode] = {
        isComplete,
        totalComponents: output.length,
        mappedComponents,
      };
    });

    return Response.json({ data: completenessMap });
  } catch (error) {
    return jsonError(error);
  }
}

import "server-only";

import { ApiError } from "@/lib/adminApi";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeChanges(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeString).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((item) => normalizeString(item))
      .filter(Boolean);
  }
  return [];
}

function getLineConfig() {
  const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const groupId = process.env.LINE_APPROVAL_GROUP_ID;
  if (!channelToken) {
    throw new ApiError(500, "LINE_CHANNEL_ACCESS_TOKEN is missing");
  }
  if (!groupId) {
    throw new ApiError(500, "LINE_APPROVAL_GROUP_ID is missing");
  }
  return { channelToken, groupId };
}

export function buildApprovalMessageText(payload) {
  const skuCode = normalizeString(payload?.skuCode);
  const skuName = normalizeString(payload?.skuName);
  const versionNo = normalizeString(payload?.versionNo);
  const editorName = normalizeString(payload?.editorName);
  const approveUrl = normalizeString(payload?.approveUrl);
  const rejectUrl = normalizeString(payload?.rejectUrl);
  const changes = normalizeChanges(payload?.changes);

  const lines = ["BOM approval requested"];
  lines.push(`SKU: ${skuCode}${skuName ? ` - ${skuName}` : ""}`);
  if (versionNo) {
    lines.push(`Version: ${versionNo}`);
  }
  if (editorName) {
    lines.push(`Editor: ${editorName}`);
  }
  if (changes.length) {
    lines.push("Changes:");
    changes.forEach((item) => {
      lines.push(`- ${item}`);
    });
  }
  if (approveUrl) {
    lines.push(`Approve: ${approveUrl}`);
  }
  if (rejectUrl) {
    lines.push(`Reject: ${rejectUrl}`);
  }

  return lines.join("\n");
}

function buildChangeItems(changes, limit = 5) {
  const items = changes.slice(0, limit);
  const overflow = changes.length - items.length;
  const rows = items.map((item) => ({
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: "\u2022",
        size: "sm",
        color: "#94A3B8",
        flex: 0,
      },
      {
        type: "text",
        text: item,
        size: "sm",
        color: "#0F172A",
        wrap: true,
      },
    ],
  }));
  if (overflow > 0) {
    rows.push({
      type: "text",
      text: `+ \u0e2d\u0e35\u0e01 ${overflow} \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23`,
      size: "xs",
      color: "#64748B",
      margin: "md",
      wrap: true,
    });
  }
  return rows;
}


function buildDiffEntries(diff = {}) {
  const sections = [
    { key: "updated", label: "รายการที่เปลี่ยนแปลง" },
    { key: "added", label: "เพิ่มรายการ" },
    { key: "removed", label: "ลบรายการ" },
  ];
  const rows = [];
  sections.forEach((section) => {
    const data = Array.isArray(diff[section.key]) ? diff[section.key] : [];
    data.forEach((item) => {
      const label = item.label ? `${section.label} ${item.label}` : section.label;
      const before = item.before || "-";
      const after = item.after || "-";
      rows.push({
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: [
          {
            type: "text",
            text: label,
            size: "sm",
            color: "#0F172A",
            weight: "bold",
          },
          {
            type: "text",
            text: `ก่อน: ${before}`,
            size: "xs",
            color: "#475569",
          },
          {
            type: "text",
            text: `หลัง: ${after}`,
            size: "xs",
            color: "#475569",
          },
        ],
      });
    });
  });
  if (!rows.length) {
    rows.push({
      type: "text",
      text: "ไม่มีรายละเอียดการเปลี่ยนแปลง",
      size: "xs",
      color: "#64748B",
    });
  }
  return rows;
}

const STATUS_INFO = {
  approved: {
    label: "อนุมัติแล้ว",
    color: "#10B981",
    message: "สูตรการผลิตได้รับการอนุมัติแล้ว",
  },
  rejected: {
    label: "ปฏิเสธแล้ว",
    color: "#EF4444",
    message: "สูตรการผลิตถูกปฏิเสธ กรุณาตรวจสอบและปรับแก้",
  },
};

function getStatusInfo(status) {
  const normalized = (status || "").toLowerCase();
  return STATUS_INFO[normalized] || {
    label: "อัปเดตสถานะ",
    color: "#94A3B8",
    message: "สถานะสูตรการผลิตถูกอัปเดต",
  };
}

export function buildApprovalResultFlexMessage(payload) {
  const skuCode = normalizeString(payload?.skuCode);
  const skuName = normalizeString(payload?.skuName);
  const versionNo = normalizeString(payload?.versionNo);
  const approverName = normalizeString(payload?.approverName);
  const approverCode = normalizeString(payload?.approverCode);
  const reason = normalizeString(payload?.reason);
  const status = normalizeString(payload?.status || payload?.action);
  const statusInfo = getStatusInfo(status);
  const displaySku = skuCode ? `${skuCode}${skuName ? ` - ${skuName}` : ""}` : skuName;
  const normalizedChanges = normalizeChanges(payload?.changes);
  const changeRows =
    normalizedChanges.length > 0
      ? buildChangeItems(normalizedChanges)
      : [
        {
          type: "text",
          text: "ไม่มีสรุปการเปลี่ยนแปลง",
          size: "xs",
          color: "#64748B",
        },
      ];
  const diffRows = buildDiffEntries(payload?.diff);

  return {
    type: "flex",
    altText: `BOM ${displaySku || "-"} ${statusInfo.label}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "text",
            text: "QUICKPLAN",
            size: "xs",
            color: "#94A3B8",
            weight: "bold",
          },
          {
            type: "text",
            text: "BOM STATUS UPDATE",
            size: "sm",
            color: "#FFFFFF",
            weight: "bold",
            margin: "md",
          },
          {
            type: "text",
            text: statusInfo.label,
            size: "md",
            color: statusInfo.color,
            weight: "bold",
            margin: "md",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "20px",
        contents: [
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                contents: [
                  {
                    type: "text",
                    text: "SKU",
                    size: "xs",
                    color: "#94A3B8",
                    flex: 3,
                  },
                  {
                    type: "text",
                    text: displaySku || "-",
                    size: "sm",
                    color: "#0F172A",
                    weight: "bold",
                    wrap: true,
                    flex: 7,
                  },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  {
                    type: "text",
                    text: "เวอร์ชัน",
                    size: "xs",
                    color: "#94A3B8",
                    flex: 3,
                  },
                  {
                    type: "text",
                    text: versionNo ? `v${versionNo}` : "-",
                    size: "sm",
                    color: "#0F172A",
                    weight: "bold",
                    flex: 7,
                    wrap: true,
                  },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  {
                    type: "text",
                    text: "ผู้อนุมัติ",
                    size: "xs",
                    color: "#94A3B8",
                    flex: 3,
                  },
                  {
                    type: "text",
                    text: approverName || "-",
                    size: "sm",
                    color: "#0F172A",
                    weight: "bold",
                    wrap: true,
                    flex: 7,
                  },
                ],
              },
              approverCode
                ? {
                  type: "box",
                  layout: "baseline",
                  contents: [
                    {
                      type: "text",
                      text: "Approver Code",
                      size: "xs",
                      color: "#94A3B8",
                      flex: 3,
                    },
                    {
                      type: "text",
                      text: approverCode,
                      size: "sm",
                      color: "#0F172A",
                      weight: "bold",
                      wrap: true,
                      flex: 7,
                    },
                  ],
                }
                : null,
              reason
                ? {
                  type: "box",
                  layout: "baseline",
                  spacing: "sm",
                  contents: [
                    {
                      type: "text",
                      text: "เหตุผล",
                      size: "xs",
                      color: "#94A3B8",
                      flex: 3,
                    },
                    {
                      type: "text",
                      text: reason,
                      size: "sm",
                      color: "#0F172A",
                      wrap: true,
                      flex: 7,
                    },
                  ],
                }
                : null,
            ].filter(Boolean),
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "สรุปการเปลี่ยนแปลง",
                size: "xs",
                color: "#94A3B8",
              },
              ...changeRows,
            ],
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "Diff",
                size: "xs",
                color: "#94A3B8",
              },
              ...diffRows,
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "20px",
        contents: [
          {
            type: "text",
            text: statusInfo.message,
            size: "xs",
            color: "#64748B",
            wrap: true,
          },
          {
            type: "text",
            text: "ระบบได้แจ้งผลการอนุมัติสูตรการผลิตเรียบร้อยแล้ว",
            size: "xs",
            color: "#94A3B8",
            wrap: true,
            align: "center",
          },
        ],
      },
    },
  };
}

export function buildApprovalFlexMessage(payload) {
  const skuCode = normalizeString(payload?.skuCode);
  const skuName = normalizeString(payload?.skuName);
  const versionNo = normalizeString(payload?.versionNo);
  const editorName = normalizeString(payload?.editorName);
  const approveUrl = normalizeString(payload?.approveUrl);
  const rejectUrl = normalizeString(payload?.rejectUrl);
  const changes = normalizeChanges(payload?.changes);

  const changeItems = changes.length
    ? buildChangeItems(changes)
    : [
      {
        type: "text",
        text: "\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e41\u0e1b\u0e25\u0e07",
        size: "sm",
        color: "#64748B",
      },
    ];

  return {
    type: "flex",
    altText: buildApprovalMessageText(payload),
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        backgroundColor: "#102C57",
        contents: [
          {
            type: "text",
            text: "BOM APPROVAL",
            size: "xs",
            color: "#D4AF37",
            weight: "bold",
          },
          {
            type: "text",
            text: "\u0e02\u0e2d\u0e2d\u0e19\u0e38\u0e21\u0e31\u0e15\u0e34\u0e2a\u0e39\u0e15\u0e23\u0e01\u0e32\u0e23\u0e1c\u0e25\u0e34\u0e15",
            size: "lg",
            color: "#FFFFFF",
            weight: "bold",
            margin: "sm",
            wrap: true,
          },
          {
            type: "text",
            text: skuCode,
            size: "sm",
            color: "#E2E8F0",
            margin: "md",
            wrap: true,
          },
          skuName
            ? {
              type: "text",
              text: skuName,
              size: "sm",
              color: "#F8FAFC",
              margin: "xs",
              wrap: true,
            }
            : null,
        ].filter(Boolean),
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "baseline",
            contents: [
              {
                type: "text",
                text: "\u0e40\u0e27\u0e2d\u0e23\u0e4c\u0e0a\u0e31\u0e19",
                size: "xs",
                color: "#94A3B8",
                flex: 3,
              },
              {
                type: "text",
                text: versionNo || "-",
                size: "sm",
                color: "#0F172A",
                weight: "bold",
                flex: 6,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            contents: [
              {
                type: "text",
                text: "\u0e1c\u0e39\u0e49\u0e41\u0e01\u0e49\u0e44\u0e02",
                size: "xs",
                color: "#94A3B8",
                flex: 3,
              },
              {
                type: "text",
                text: editorName || "-",
                size: "sm",
                color: "#0F172A",
                weight: "bold",
                flex: 6,
                wrap: true,
              },
            ],
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "text",
            text: "\u0e2a\u0e23\u0e38\u0e1b\u0e01\u0e32\u0e23\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e41\u0e1b\u0e25\u0e07",
            size: "sm",
            color: "#0F172A",
            weight: "bold",
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: changeItems,
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "รายละเอียดการเปลี่ยนแปลง",
                size: "xs",
                color: "#94A3B8",
              },
              ...buildDiffEntries(payload?.diff),
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "20px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#D4AF37",
            action: {
              type: "uri",
              label: "\u0e2d\u0e19\u0e38\u0e21\u0e31\u0e15\u0e34",
              uri: approveUrl,
            },
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "uri",
              label: "\u0e1b\u0e0f\u0e34\u0e40\u0e2a\u0e18",
              uri: rejectUrl,
            },
          },
          {
            type: "text",
            text: "\u0e01\u0e14\u0e1b\u0e38\u0e48\u0e21\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23\u0e43\u0e19 LINE",
            size: "xs",
            color: "#94A3B8",
            align: "center",
          },
        ],
      },
    },
  };
}

export async function sendLineGroupMessage(messages) {
  const { channelToken, groupId } = getLineConfig();
  const payloadMessages = Array.isArray(messages) ? messages : [messages];
  const response = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: groupId,
      messages: payloadMessages,
    }),
  });

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch (error) {
      details = "";
    }
    throw new ApiError(502, "Failed to send LINE message", details);
  }
}

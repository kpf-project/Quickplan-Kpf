import { NextResponse } from "next/server";

const DEPRECATED_MESSAGE =
  "Material owner settings were removed. Use claim-based flow at /production-line/planning/claims.";

function deprecatedResponse() {
  return NextResponse.json(
    {
      error: "Deprecated endpoint",
      message: DEPRECATED_MESSAGE,
    },
    { status: 410 }
  );
}

export async function GET() {
  return deprecatedResponse();
}

export async function POST() {
  return deprecatedResponse();
}

export async function DELETE() {
  return deprecatedResponse();
}

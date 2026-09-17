export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      deploymentId: process.env.NEXT_PUBLIC_DEPLOYMENT_ID || "development",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}

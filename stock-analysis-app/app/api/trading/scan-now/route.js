export async function POST(request) {
  // Reuses the exact same scan logic as the scheduled cron job, just
  // triggered manually via button click instead of a schedule.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/cron/trading-scan`, {
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
  });

  const data = await res.json();
  return Response.json(data);
}

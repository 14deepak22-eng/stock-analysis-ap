import { NextResponse } from "next/server";
import { syncInstrumentUniverse } from "@/lib/intraday/instrumentService";

export async function POST(request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncInstrumentUniverse();
  return NextResponse.json(result);
}

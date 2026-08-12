import { NextResponse } from "next/server";
import { processEmailOutbox } from "@/lib/email-outbox";
export async function GET(request:Request){const secret=process.env.CRON_SECRET;if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({code:"UNAUTHORIZED"},{status:401});return NextResponse.json(await processEmailOutbox());}

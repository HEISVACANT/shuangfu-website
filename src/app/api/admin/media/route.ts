import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { AdminMediaItem } from "@/lib/products-admin-repository-v2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const accepted = new Set(["image/jpeg","image/png","image/webp"]); const maxBytes=10*1024*1024;

const mediaRowsSchema = z.array(z.object({
  id: z.string().uuid(),
  storage_path: z.string().min(1),
  mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byte_size: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  variants: z.record(z.string(), z.string()),
  created_at: z.string()
}));

function escapeIlikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
  const { data: allowed, error: permissionError } = await supabase.rpc("has_permission", {
    p_resource: "media",
    p_action: "view"
  });
  if (permissionError) return NextResponse.json({ code: "DATABASE_ERROR" }, { status: 500 });
  if (!allowed) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });

  const search = new URL(request.url).searchParams.get("query")?.trim().slice(0, 100) ?? "";
  let query = supabase
    .from("media")
    .select("id,storage_path,mime_type,byte_size,width,height,variants,created_at")
    .is("deleted_at", null);
  if (search) query = query.ilike("storage_path", `%${escapeIlikeLiteral(search)}%`);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ code: "DATABASE_ERROR" }, { status: 500 });
  const parsed = mediaRowsSchema.safeParse(data);
  if (!parsed.success) return NextResponse.json({ code: "DATABASE_ERROR" }, { status: 500 });

  const items: AdminMediaItem[] = parsed.data.map((row) => ({
    id: row.id,
    url: row.storage_path,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    variants: row.variants,
    createdAt: row.created_at
  }));
  return NextResponse.json({ items });
}

export async function POST(request:Request){
  const supabase=await createSupabaseServerClient(); if(!supabase)return NextResponse.json({code:"SERVICE_UNAVAILABLE"},{status:503});
  const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({code:"UNAUTHORIZED"},{status:401});
  const {data:allowed}=await supabase.rpc("has_permission",{p_resource:"media",p_action:"create"}); if(!allowed)return NextResponse.json({code:"FORBIDDEN"},{status:403});
  const file=(await request.formData()).get("file"); if(!(file instanceof File)||!accepted.has(file.type)||file.size<=0||file.size>maxBytes)return NextResponse.json({code:"INVALID_IMAGE"},{status:400});
  const source=Buffer.from(await file.arrayBuffer()); const metadata=await sharp(source).metadata(); if(!metadata.width||!metadata.height)return NextResponse.json({code:"INVALID_IMAGE"},{status:400});
  const id=randomUUID(); const variants:Record<string,string>={};
  for(const width of [480,960,1600].filter(value=>value<=metadata.width!)){const output=await sharp(source).rotate().resize({width,withoutEnlargement:true}).webp({quality:84}).toBuffer();const path=`${id}/${width}.webp`;const {error}=await supabase.storage.from("media").upload(path,output,{contentType:"image/webp",upsert:false});if(error)return NextResponse.json({code:"UPLOAD_FAILED"},{status:500});variants[String(width)]=supabase.storage.from("media").getPublicUrl(path).data.publicUrl;}
  const originalPath=`${id}/original.${file.type.split("/")[1]}`; const {error:uploadError}=await supabase.storage.from("media").upload(originalPath,source,{contentType:file.type,upsert:false});if(uploadError)return NextResponse.json({code:"UPLOAD_FAILED"},{status:500});
  const originalUrl=supabase.storage.from("media").getPublicUrl(originalPath).data.publicUrl; const {data,error}=await supabase.from("media").insert({id,storage_path:originalUrl,mime_type:file.type,byte_size:file.size,width:metadata.width,height:metadata.height,variants}).select("id,storage_path,variants").single();if(error)return NextResponse.json({code:"DATABASE_ERROR"},{status:500});return NextResponse.json(data,{status:201});
}

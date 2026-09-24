import { NextResponse } from "next/server";
import { getImage } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  if (!/^[0-9a-f]{24}$/.test(id) || !/^\d{1,2}$/.test(n)) return new NextResponse("not found", { status: 404 });
  const b64 = await getImage(id, Number(n));
  if (!b64) return new NextResponse("not found", { status: 404 });
  return new NextResponse(Buffer.from(b64, "base64"), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

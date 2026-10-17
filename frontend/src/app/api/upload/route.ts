import { NextResponse } from "next/server";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_METADATA_TYPE = "application/json";

export async function POST(req: Request) {
  const token = process.env.PINATA_JWT;
  if (!token) {
    return NextResponse.json({ error: "Uploads are not configured on this deployment." }, { status: 503 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type) && file.type !== ALLOWED_METADATA_TYPE) {
      return NextResponse.json({ error: "Use a JPEG, PNG, WebP, GIF image, or NFT metadata JSON." }, { status: 415 });
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Images must be smaller than 4 MB." }, { status: 413 });
    }

    const body = new FormData();
    body.append("network", "public");
    body.append("file", file, file.name);

    let pinataResponse: Response;
    try {
      pinataResponse = await fetch("https://uploads.pinata.cloud/v3/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
    } catch (error) {
      console.error("Pinata upload request failed", error);
      return NextResponse.json({ error: "Pinata could not be reached. Please try again." }, { status: 502 });
    }

    const result = await pinataResponse.json().catch(() => null);
    if (!pinataResponse.ok) {
      console.error("Pinata upload failed", pinataResponse.status);
      return NextResponse.json({ error: "Pinata could not store this image. Please try again." }, { status: 502 });
    }

    const cid = result?.data?.cid;
    if (typeof cid !== "string" || !cid) {
      console.error("Pinata returned an invalid upload response");
      return NextResponse.json({ error: "Pinata returned an invalid upload response." }, { status: 502 });
    }

    return NextResponse.json({ cid });
  } catch (error) {
    console.error("Upload request could not be processed", error);
    return NextResponse.json({ error: "The upload could not be processed. Please try again." }, { status: 400 });
  }
}

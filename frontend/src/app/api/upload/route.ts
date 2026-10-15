import { NextResponse } from "next/server";

// This file runs on OUR SERVER, never in the browser. So the secret PINATA_JWT stays secret.
// Pinata Files API v3: https://docs.pinata.cloud
export async function POST(req: Request) {
  // 1. Take the file the browser sent us
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // 2. Send it to Pinata, with our secret key, on the PUBLIC IPFS network
  const body = new FormData();
  body.append("network", "public");
  body.append("file", file, file.name);

  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
    body,
  });

  // 3. Give the browser only what it needs: the CID
  const json = await res.json();
  if (!res.ok) return NextResponse.json(json, { status: res.status });
  return NextResponse.json({ cid: json.data.cid });
}

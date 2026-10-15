// Sends one file to OUR server route (/api/upload), which sends it to Pinata with the secret key.
// Returns the CID: the fingerprint of the file on IPFS.
export async function uploadToIpfs(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/upload", { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json.cid as string;
}

// Uploads the image, then the metadata JSON that points to it. Returns "ipfs://<metadata CID>".
export async function uploadNft(image: File, name: string, description: string): Promise<string> {
  const imageCid = await uploadToIpfs(image);
  const metadata = { name, description, image: `ipfs://${imageCid}` };
  const metadataFile = new File([JSON.stringify(metadata)], "metadata.json", { type: "application/json" });
  const metadataCid = await uploadToIpfs(metadataFile);
  return `ipfs://${metadataCid}`;
}

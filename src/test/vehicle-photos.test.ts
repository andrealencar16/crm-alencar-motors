import { describe, it, expect } from "vitest";
import { validatePhotoFile, movePhoto, storagePathFromUrl, normalizeOpcionais } from "@/lib/vehiclePhotos";

describe("vehicle photos", () => {
  it("rejects non-image formats", () => {
    expect(validatePhotoFile({ type: "application/pdf", size: 100 })).not.toBeNull();
  });
  it("rejects files over 10 MB", () => {
    expect(validatePhotoFile({ type: "image/jpeg", size: 11 * 1024 * 1024 })).not.toBeNull();
  });
  it("accepts a 2 MB jpeg", () => {
    expect(validatePhotoFile({ type: "image/jpeg", size: 2 * 1024 * 1024 })).toBeNull();
  });
  it("moving a photo to index 0 makes it the main photo", () => {
    expect(movePhoto(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
  it("extracts storage path only from vehicle-photos URLs", () => {
    expect(storagePathFromUrl("https://x.supabase.co/storage/v1/object/public/vehicle-photos/org/abc.jpg")).toBe("org/abc.jpg");
    expect(storagePathFromUrl("https://other.com/a.jpg")).toBeNull();
  });
  it("dedupes opcionais case-insensitively", () => {
    expect(normalizeOpcionais([" Ar condicionado", "ar condicionado", "", "Airbag"])).toEqual(["Ar condicionado", "Airbag"]);
  });
});

import { useState, useRef } from "react";
import { ModalFrame } from "./ui";
import { apiRequest } from "../services/api";
import { useAuth } from "../hooks/useAuth";

type ScannedImage = {
  file: File;
  previewUrl: string;
};

type ReceiptScanPanelProps = {
  onScanComplete: (data: {
    amount: string;
    description: string;
    date: string;
    category?: string;
    platform?: string;
  }) => void;
};

function compressImage(file: File, maxEdge = 1600): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxEdge) {
            height = Math.round((height * maxEdge) / width);
            width = maxEdge;
          }
        } else {
          if (height > maxEdge) {
            width = Math.round((width * maxEdge) / height);
            height = maxEdge;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get 2d canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        const base64 = dataUrl.split(",")[1];
        resolve({ data: base64, mimeType: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function ReceiptScanPanel({ onScanComplete }: ReceiptScanPanelProps) {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isMultiPart, setIsMultiPart] = useState(false);

  const [img1, setImg1] = useState<ScannedImage | null>(null);
  const [img2, setImg2] = useState<ScannedImage | null>(null);
  const [img3, setImg3] = useState<ScannedImage | null>(null);

  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);
  const fileInputRef3 = useRef<HTMLInputElement>(null);

  const handleFileChange = (slot: 1 | 2 | 3, file: File | null) => {
    if (!file) {
      if (slot === 1) setImg1(null);
      if (slot === 2) setImg2(null);
      if (slot === 3) setImg3(null);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const item = { file, previewUrl };

    if (slot === 1) setImg1(item);
    if (slot === 2) setImg2(item);
    if (slot === 3) setImg3(item);
  };

  const handleScan = async () => {
    setError(null);
    const activeFiles = [img1, isMultiPart ? img2 : null, isMultiPart ? img3 : null].filter(Boolean) as ScannedImage[];

    if (activeFiles.length === 0) {
      setError("Please select at least one receipt photo to scan.");
      return;
    }

    if (!currentUser) {
      setError("Authentication is required.");
      return;
    }

    setIsScanning(true);

    try {
      const base64Images = await Promise.all(
        activeFiles.map(img => compressImage(img.file))
      );

      const response = await apiRequest<{ draft: any }>(
        currentUser,
        {
          url: "/api/receipts",
          method: "POST",
          data: { images: base64Images }
        },
        "Failed to scan receipt."
      );

      if (!response.draft) {
        throw new Error("No structured draft returned from scanner.");
      }

      onScanComplete({
        amount: response.draft.amount,
        description: `${response.draft.merchant} (${response.draft.description})`,
        date: response.draft.date,
        category: response.draft.category,
        platform: ""
      });

      resetState();
      setIsOpen(false);
    } catch (err: any) {
      console.error("Scan error:", err);
      setError(err.message || "Failed to scan receipt. Please verify image quality and try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const resetState = () => {
    if (img1) URL.revokeObjectURL(img1.previewUrl);
    if (img2) URL.revokeObjectURL(img2.previewUrl);
    if (img3) URL.revokeObjectURL(img3.previewUrl);
    setImg1(null);
    setImg2(null);
    setImg3(null);
    setIsMultiPart(false);
    setError(null);
    setIsScanning(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="ui-button-secondary flex items-center justify-center gap-2 py-2 px-3 text-xs w-full mb-4 border-dashed border-2 border-primary/40 text-primary hover:bg-primary/5 hover:border-primary transition-all rounded-xl"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
        </svg>
        Scan Receipt Photo (Gemini OCR)
      </button>

      {isOpen && (
        <ModalFrame onClose={() => { resetState(); setIsOpen(false); }} className="max-w-[480px] p-6">
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-bold text-ink tracking-tight">Scan Receipt</h3>
              <p className="text-xs text-muted mt-1">
                Upload photos of your receipt. Gemini will extract the merchant, amount, category, and date to automatically fill the form.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-[color:var(--danger-text)] text-xs rounded-xl border border-red-100">
                {error}
              </div>
            )}

            <label className="flex items-center gap-2.5 text-xs font-semibold text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isMultiPart}
                onChange={(e) => setIsMultiPart(e.target.checked)}
                className="h-4 w-4 rounded-md border-[color:var(--border)] text-primary focus:ring-primary"
              />
              This receipt spans multiple photos (long bill)
            </label>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center">
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef1}
                  onChange={(e) => handleFileChange(1, e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef1.current?.click()}
                  className={`h-28 w-full border-2 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all overflow-hidden ${
                    img1 ? "border-solid border-slate-200" : "border-dashed border-slate-300 hover:border-primary bg-slate-50/50"
                  }`}
                >
                  {img1 ? (
                    <img src={img1.previewUrl} className="h-full w-full object-cover" alt="Receipt slot 1" />
                  ) : (
                    <>
                      <span className="text-xs font-bold text-slate-500">Photo 1</span>
                      <span className="text-[10px] text-muted">Primary</span>
                    </>
                  )}
                </button>
                {img1 && (
                  <button
                    type="button"
                    onClick={() => handleFileChange(1, null)}
                    className="text-[10px] text-red-500 hover:underline mt-1.5"
                  >
                    Remove
                  </button>
                )}
              </div>

              {isMultiPart && (
                <div className="flex flex-col items-center animate-fadeIn">
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef2}
                    onChange={(e) => handleFileChange(2, e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef2.current?.click()}
                    className={`h-28 w-full border-2 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all overflow-hidden ${
                      img2 ? "border-solid border-slate-200" : "border-dashed border-slate-300 hover:border-primary bg-slate-50/50"
                    }`}
                  >
                    {img2 ? (
                      <img src={img2.previewUrl} className="h-full w-full object-cover" alt="Receipt slot 2" />
                    ) : (
                      <>
                        <span className="text-xs font-bold text-slate-500">Photo 2</span>
                        <span className="text-[10px] text-muted">Optional</span>
                      </>
                    )}
                  </button>
                  {img2 && (
                    <button
                      type="button"
                      onClick={() => handleFileChange(2, null)}
                      className="text-[10px] text-red-500 hover:underline mt-1.5"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}

              {isMultiPart && (
                <div className="flex flex-col items-center animate-fadeIn">
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef3}
                    onChange={(e) => handleFileChange(3, e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef3.current?.click()}
                    className={`h-28 w-full border-2 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all overflow-hidden ${
                      img3 ? "border-solid border-slate-200" : "border-dashed border-slate-300 hover:border-primary bg-slate-50/50"
                    }`}
                  >
                    {img3 ? (
                      <img src={img3.previewUrl} className="h-full w-full object-cover" alt="Receipt slot 3" />
                    ) : (
                      <>
                        <span className="text-xs font-bold text-slate-500">Photo 3</span>
                        <span className="text-[10px] text-muted">Optional</span>
                      </>
                    )}
                  </button>
                  {img3 && (
                    <button
                      type="button"
                      onClick={() => handleFileChange(3, null)}
                      className="text-[10px] text-red-500 hover:underline mt-1.5"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => { resetState(); setIsOpen(false); }}
                className="ui-button-secondary text-xs px-4 py-2"
                disabled={isScanning}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleScan}
                className="ui-button-primary text-xs px-5 py-2 flex items-center gap-2"
                disabled={isScanning || !img1}
              >
                {isScanning ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Scanning...
                  </>
                ) : (
                  "Start Scan"
                )}
              </button>
            </div>
          </div>
        </ModalFrame>
      )}
    </>
  );
}

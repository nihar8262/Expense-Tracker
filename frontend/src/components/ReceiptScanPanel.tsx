import { useState, useRef, useEffect } from "react";
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

  // Active slot for camera capturing
  const [activeCameraSlot, setActiveCameraSlot] = useState<1 | 2 | 3 | null>(null);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Hidden file inputs for device upload
  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);
  const fileInputRef3 = useRef<HTMLInputElement>(null);

  // Hidden native camera fallback input
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);

  // Stop camera media tracks
  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setActiveCameraSlot(null);
    setIsCameraStarting(false);
    setCameraError(null);
  };

  // Start camera stream for a given slot
  const startCamera = async (slot: 1 | 2 | 3, facing: "environment" | "user" = cameraFacing) => {
    stopCameraStream();
    setActiveCameraSlot(slot);
    setIsCameraStarting(true);
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Live camera is not supported by your browser. Use device upload instead.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraStarting(false);
    } catch (err: any) {
      console.warn("Camera start failed, offering native fallback:", err);
      setIsCameraStarting(false);
      setCameraError(err.message || "Unable to access camera. Please check camera permissions.");
    }
  };

  // Capture snapshot from active video stream
  const capturePhoto = (slot: 1 | 2 | 3) => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `receipt-photo-${slot}-${Date.now()}.jpg`, {
          type: "image/jpeg"
        });
        handleFileChange(slot, file);
        stopCameraStream();
      },
      "image/jpeg",
      0.9
    );
  };

  // Flip camera between front and back
  const toggleCameraFacing = () => {
    const nextFacing = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(nextFacing);
    if (activeCameraSlot) {
      startCamera(activeCameraSlot, nextFacing);
    }
  };

  // Clean up camera when modal closes or component unmounts
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const handleFileChange = (slot: 1 | 2 | 3, file: File | null) => {
    if (!file) {
      if (slot === 1) {
        if (img1) URL.revokeObjectURL(img1.previewUrl);
        setImg1(null);
      }
      if (slot === 2) {
        if (img2) URL.revokeObjectURL(img2.previewUrl);
        setImg2(null);
      }
      if (slot === 3) {
        if (img3) URL.revokeObjectURL(img3.previewUrl);
        setImg3(null);
      }
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const item = { file, previewUrl };

    if (slot === 1) {
      if (img1) URL.revokeObjectURL(img1.previewUrl);
      setImg1(item);
    }
    if (slot === 2) {
      if (img2) URL.revokeObjectURL(img2.previewUrl);
      setImg2(item);
    }
    if (slot === 3) {
      if (img3) URL.revokeObjectURL(img3.previewUrl);
      setImg3(item);
    }
  };

  const handleScan = async () => {
    setError(null);
    const activeFiles = [img1, isMultiPart ? img2 : null, isMultiPart ? img3 : null].filter(
      Boolean
    ) as ScannedImage[];

    if (activeFiles.length === 0) {
      setError("Please capture or select at least one receipt photo to scan.");
      return;
    }

    if (!currentUser) {
      setError("Authentication is required.");
      return;
    }

    setIsScanning(true);

    try {
      const base64Images = await Promise.all(activeFiles.map((img) => compressImage(img.file)));

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

      if (response.draft.is_receipt === false) {
        throw new Error(
          response.draft.error_message ||
            "No receipt detected: The uploaded image does not appear to be a receipt or bill. Please take or upload a clear photo of a receipt."
        );
      }

      const parsedAmount = parseFloat(response.draft.amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error(
          "No receipt detected: Could not find a valid transaction amount on this image. Please take or upload a clear photo of your receipt."
        );
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
    stopCameraStream();
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

  const openModalWithCamera = () => {
    setIsOpen(true);
    // Slight delay to ensure video element is mounted
    setTimeout(() => {
      startCamera(1);
    }, 150);
  };

  const openModalWithUpload = () => {
    setIsOpen(true);
    setTimeout(() => {
      fileInputRef1.current?.click();
    }, 150);
  };

  return (
    <>
      {/* Quick Access Dual-Action Scan Card */}
      <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/[0.02] p-3 mb-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
              </svg>
            </span>
            <div>
              <p className="text-xs font-bold text-ink">Auto-Fill from Receipt</p>
              <p className="text-xs text-muted">Take a photo or upload an image to extract details automatically</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={openModalWithCamera}
            className="ui-button-secondary text-xs py-2 px-3 justify-center gap-1.5 font-semibold text-primary border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-all shadow-sm rounded-xl"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-4 w-4 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
            </svg>
            Take Photo
          </button>

          <button
            type="button"
            onClick={openModalWithUpload}
            className="ui-button-secondary text-xs py-2 px-3 justify-center gap-1.5 font-semibold text-secondary hover:text-ink hover:bg-black/5 transition-all shadow-sm rounded-xl"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-4 w-4 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Upload Image
          </button>
        </div>
      </div>

      {isOpen && (
        <ModalFrame
          onClose={() => {
            resetState();
            setIsOpen(false);
          }}
          className="max-w-[520px] p-5 sm:p-6"
        >
          <div className="space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-3">
              <div>
                <h3 className="text-lg font-bold text-ink tracking-tight">Scan Receipt</h3>
                <p className="text-xs text-muted mt-0.5">
                  Take a photo or select an image from your device.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetState();
                  setIsOpen(false);
                }}
                className="text-muted hover:text-ink p-1 text-sm rounded-lg hover:bg-black/5 transition-colors"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-[color:var(--danger-text)] text-xs rounded-xl border border-red-100">
                {error}
              </div>
            )}

            {/* Live Camera Viewfinder Overlay when Camera is Active */}
            {activeCameraSlot !== null ? (
              <div className="space-y-3 rounded-2xl bg-black p-3 text-white">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-zinc-900 flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />

                  {/* Camera Bounding Guideline */}
                  <div className="absolute inset-4 rounded-xl border-2 border-dashed border-white/40 pointer-events-none flex flex-col justify-between p-2">
                    <span className="text-[10px] text-white/70 font-mono self-start bg-black/40 px-1.5 py-0.5 rounded">
                      Receipt Area
                    </span>
                  </div>

                  {isCameraStarting && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-white">Starting camera...</span>
                    </div>
                  )}

                  {cameraError && (
                    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-4 text-center gap-3">
                      <p className="text-xs text-red-300">{cameraError}</p>
                      <button
                        type="button"
                        onClick={() => nativeCameraInputRef.current?.click()}
                        className="ui-button-primary text-xs px-4 py-2"
                      >
                        Use Device Camera App
                      </button>
                    </div>
                  )}
                </div>

                {/* Camera Control Bar */}
                <div className="flex items-center justify-between px-2 pt-1">
                  <button
                    type="button"
                    onClick={stopCameraStream}
                    className="text-xs text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => capturePhoto(activeCameraSlot)}
                    disabled={isCameraStarting || !!cameraError}
                    className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-primary text-white shadow-lg active:scale-95 transition-transform hover:bg-primary/90 disabled:opacity-50"
                    title="Click to capture photo"
                  >
                    <span className="h-4 w-4 rounded-full bg-white" />
                  </button>

                  <button
                    type="button"
                    onClick={toggleCameraFacing}
                    className="text-xs text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1"
                    title="Flip Camera"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    Flip
                  </button>
                </div>
              </div>
            ) : (
              /* Photo Slots (when camera is inactive) */
              <div className="space-y-4">
                <label className="flex items-center gap-2.5 text-xs font-semibold text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isMultiPart}
                    onChange={(e) => setIsMultiPart(e.target.checked)}
                    className="h-4 w-4 rounded-md border-[color:var(--border)] text-primary focus:ring-primary"
                  />
                  This receipt spans multiple photos (long bill)
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Slot 1 (Primary) */}
                  <div className="flex flex-col items-center">
                    {img1 ? (
                      <div className="relative h-32 w-full rounded-2xl overflow-hidden border border-primary/20 shadow-sm bg-black/5">
                        <img
                          src={img1.previewUrl}
                          className="h-full w-full object-cover"
                          alt="Receipt slot 1"
                        />
                        <button
                          type="button"
                          onClick={() => handleFileChange(1, null)}
                          className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors flex items-center justify-center text-xs font-bold"
                          title="Remove photo"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="h-32 w-full border-2 border-dashed border-primary/30 rounded-2xl p-2 flex flex-col items-center justify-center gap-2 bg-primary/[0.02]">
                        <span className="text-xs font-bold text-ink">Photo 1 (Primary)</span>
                        <div className="flex gap-1.5 w-full">
                          <button
                            type="button"
                            onClick={() => startCamera(1)}
                            className="flex-1 ui-button-secondary text-[10px] py-1.5 px-1 justify-center gap-1 font-semibold text-primary border-primary/20"
                          >
                            📸 Camera
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef1.current?.click()}
                            className="flex-1 ui-button-secondary text-[10px] py-1.5 px-1 justify-center gap-1 font-semibold text-secondary"
                          >
                            📁 Upload
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Slot 2 (Optional) */}
                  {isMultiPart && (
                    <div className="flex flex-col items-center animate-fadeIn">
                      {img2 ? (
                        <div className="relative h-32 w-full rounded-2xl overflow-hidden border border-primary/20 shadow-sm bg-black/5">
                          <img
                            src={img2.previewUrl}
                            className="h-full w-full object-cover"
                            alt="Receipt slot 2"
                          />
                          <button
                            type="button"
                            onClick={() => handleFileChange(2, null)}
                            className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors flex items-center justify-center text-xs font-bold"
                            title="Remove photo"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="h-32 w-full border-2 border-dashed border-[color:var(--border)] rounded-2xl p-2 flex flex-col items-center justify-center gap-2 bg-black/[0.01]">
                          <span className="text-xs font-bold text-secondary">Photo 2 (Optional)</span>
                          <div className="flex gap-1.5 w-full">
                            <button
                              type="button"
                              onClick={() => startCamera(2)}
                              className="flex-1 ui-button-secondary text-[10px] py-1.5 px-1 justify-center gap-1 font-semibold text-primary border-primary/20"
                            >
                              📸 Camera
                            </button>
                            <button
                              type="button"
                              onClick={() => fileInputRef2.current?.click()}
                              className="flex-1 ui-button-secondary text-[10px] py-1.5 px-1 justify-center gap-1 font-semibold text-secondary"
                            >
                              📁 Upload
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Slot 3 (Optional) */}
                  {isMultiPart && (
                    <div className="flex flex-col items-center animate-fadeIn">
                      {img3 ? (
                        <div className="relative h-32 w-full rounded-2xl overflow-hidden border border-primary/20 shadow-sm bg-black/5">
                          <img
                            src={img3.previewUrl}
                            className="h-full w-full object-cover"
                            alt="Receipt slot 3"
                          />
                          <button
                            type="button"
                            onClick={() => handleFileChange(3, null)}
                            className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors flex items-center justify-center text-xs font-bold"
                            title="Remove photo"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="h-32 w-full border-2 border-dashed border-[color:var(--border)] rounded-2xl p-2 flex flex-col items-center justify-center gap-2 bg-black/[0.01]">
                          <span className="text-xs font-bold text-secondary">Photo 3 (Optional)</span>
                          <div className="flex gap-1.5 w-full">
                            <button
                              type="button"
                              onClick={() => startCamera(3)}
                              className="flex-1 ui-button-secondary text-[10px] py-1.5 px-1 justify-center gap-1 font-semibold text-primary border-primary/20"
                            >
                              📸 Camera
                            </button>
                            <button
                              type="button"
                              onClick={() => fileInputRef3.current?.click()}
                              className="flex-1 ui-button-secondary text-[10px] py-1.5 px-1 justify-center gap-1 font-semibold text-secondary"
                            >
                              📁 Upload
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hidden native input elements */}
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef1}
              onChange={(e) => handleFileChange(1, e.target.files?.[0] || null)}
              className="hidden"
            />
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef2}
              onChange={(e) => handleFileChange(2, e.target.files?.[0] || null)}
              className="hidden"
            />
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef3}
              onChange={(e) => handleFileChange(3, e.target.files?.[0] || null)}
              className="hidden"
            />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={nativeCameraInputRef}
              onChange={(e) => {
                if (activeCameraSlot) {
                  handleFileChange(activeCameraSlot, e.target.files?.[0] || null);
                  stopCameraStream();
                } else {
                  handleFileChange(1, e.target.files?.[0] || null);
                }
              }}
              className="hidden"
            />

            {/* Modal Actions */}
            <div className="flex gap-3 justify-end pt-2 border-t border-[color:var(--border)]">
              <button
                type="button"
                onClick={() => {
                  resetState();
                  setIsOpen(false);
                }}
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
                    <svg
                      className="animate-spin h-3.5 w-3.5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Scanning Receipt...
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

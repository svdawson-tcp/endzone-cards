import { useEffect, useRef, useState } from "react";
import { Camera, X, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
  facingMode?: "user" | "environment";
}

export function CameraCapture({
  onCapture,
  onClose,
  facingMode = "environment",
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentFacingMode, setCurrentFacingMode] = useState(facingMode);

  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      try {
        // Request camera access
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: currentFacingMode,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (!mounted) {
          // Component unmounted during async operation
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (mounted) {
              setIsReady(true);
            }
          };
        }
      } catch (err: any) {
        if (!mounted) return;

        console.error("Camera access error:", err);

        // Provide user-friendly error messages
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setError("Camera access denied. Please use 'Choose Photo' instead.");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setError("No camera detected. Please use the file picker.");
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
          setError("Camera is in use by another app. Please close it and try again.");
        } else {
          setError(`Camera error: ${err.message}`);
        }
      }
    };

    startCamera();

    // Cleanup function
    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [currentFacingMode]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !isReady) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to blob (JPEG at 95% quality)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Failed to capture photo. Please try again.");
          return;
        }

        // Create File object from blob
        const file = new File([blob], `camera-capture-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });

        // Stop camera stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        // Pass captured file to parent
        onCapture(file);
      },
      "image/jpeg",
      0.95
    );
  };

  const switchCamera = () => {
    setCurrentFacingMode((prev) => (prev === "user" ? "environment" : "user"));
    setIsReady(false);
  };

  const handleClose = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Video Preview */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {!isReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-white text-lg">Starting camera...</p>
          </div>
        )}
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Error Display */}
      {error && (
        <div className="absolute top-4 left-4 right-4">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Controls */}
      <div className="p-6 bg-black/80 flex items-center justify-between gap-4">
        {/* Close Button */}
        <Button
          onClick={handleClose}
          variant="outline"
          size="lg"
          className="bg-white/10 border-white/30 text-white hover:bg-white/20"
        >
          <X className="mr-2 h-5 w-5" />
          Cancel
        </Button>

        {/* Capture Button */}
        <Button
          onClick={capturePhoto}
          disabled={!isReady || !!error}
          size="lg"
          className="flex-1 bg-white text-black hover:bg-white/90 min-h-[56px] text-lg font-semibold"
        >
          <Camera className="mr-2 h-6 w-6" />
          CAPTURE
        </Button>

        {/* Switch Camera Button (only on mobile) */}
        <Button
          onClick={switchCamera}
          disabled={!isReady || !!error}
          variant="outline"
          size="lg"
          className="bg-white/10 border-white/30 text-white hover:bg-white/20"
        >
          <RotateCw className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

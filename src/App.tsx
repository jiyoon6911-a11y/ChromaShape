import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Plus, X, Circle, Square, Triangle, RectangleHorizontal, Film, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from './lib/utils';

type ShapeType = 'circle' | 'square' | 'triangle' | 'pill';

interface Moment {
  id: string;
  imageUrl: string;
  shape: ShapeType;
  timestamp: Date;
}

const SHAPES: Record<ShapeType, { label: string; icon: React.ReactNode; clipPath: string; aspectRatio: string }> = {
  circle: { label: 'Circle', icon: <Circle className="w-8 h-8" />, clipPath: 'circle(50% at 50% 50%)', aspectRatio: '1/1' },
  square: { label: 'Square', icon: <Square className="w-8 h-8" />, clipPath: 'inset(0)', aspectRatio: '1/1' },
  triangle: { label: 'Triangle', icon: <Triangle className="w-8 h-8" />, clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)', aspectRatio: '1/1' },
  pill: { label: 'Pill', icon: <RectangleHorizontal className="w-8 h-8" />, clipPath: 'inset(0 round 9999px)', aspectRatio: '2/3' },
};

type ViewState = 'timeline' | 'select-shape' | 'camera';

export default function App() {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [view, setView] = useState<ViewState>('timeline');
  const [selectedShape, setSelectedShape] = useState<ShapeType | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access denied or not available", err);
      alert("카메라 접근 권한이 필요합니다.");
      setView('timeline');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (view === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [view]);

  const handleShapeSelect = (shape: ShapeType) => {
    setSelectedShape(shape);
    setView('camera');
  };

  const handleCapture = () => {
    if (!videoRef.current || !selectedShape) return;
    
    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    
    // Use a square crop for consistency
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Center crop
    const startX = (video.videoWidth - size) / 2;
    const startY = (video.videoHeight - size) / 2;
    
    ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size);
    const imageUrl = canvas.toDataURL('image/jpeg', 0.8);

    const newMoment: Moment = {
      id: Math.random().toString(36).substring(7),
      imageUrl,
      shape: selectedShape,
      timestamp: new Date(),
    };

    // Add to the end of the timeline (oldest first for video export logic)
    setMoments([...moments, newMoment]);
    setView('timeline');
    setSelectedShape(null);
  };

  const exportDailyVideo = async () => {
    if (moments.length === 0) return;
    setIsExporting(true);

    try {
      const canvas = document.createElement('canvas');
      const CANVAS_SIZE = 800;
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas context not available");

      // Set up MediaRecorder
      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
        ? 'video/webm;codecs=vp9' 
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recordingPromise = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `shapeframe-${format(new Date(), 'yyyyMMdd')}.webm`;
          a.click();
          URL.revokeObjectURL(url);
          resolve();
        };
      });

      recorder.start();

      // Draw frames
      for (const moment of moments) {
        // 1. Draw background
        ctx.fillStyle = '#f4f4f0';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        // 2. Load image
        const img = new Image();
        img.src = moment.imageUrl;
        await new Promise((resolve) => {
          img.onload = resolve;
        });

        // 3. Draw Shape Mask
        ctx.save();
        ctx.beginPath();
        
        const centerX = CANVAS_SIZE / 2;
        const centerY = CANVAS_SIZE / 2;
        const size = 600; // Base size for shapes
        const halfSize = size / 2;

        if (moment.shape === 'circle') {
          ctx.arc(centerX, centerY, halfSize, 0, Math.PI * 2);
        } else if (moment.shape === 'square') {
          ctx.rect(centerX - halfSize, centerY - halfSize, size, size);
        } else if (moment.shape === 'triangle') {
          ctx.moveTo(centerX, centerY - halfSize);
          ctx.lineTo(centerX + halfSize, centerY + halfSize);
          ctx.lineTo(centerX - halfSize, centerY + halfSize);
        } else if (moment.shape === 'pill') {
          const pillWidth = 400;
          const pillHeight = 600;
          if (ctx.roundRect) {
            ctx.roundRect(centerX - pillWidth/2, centerY - pillHeight/2, pillWidth, pillHeight, pillWidth/2);
          } else {
            // Fallback for older browsers
            ctx.rect(centerX - pillWidth/2, centerY - pillHeight/2, pillWidth, pillHeight);
          }
        }
        
        ctx.closePath();
        ctx.clip();

        // 4. Draw Image inside mask
        ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.restore();

        // 5. Draw Border
        ctx.lineWidth = 16;
        ctx.strokeStyle = '#000';
        ctx.stroke();

        // 6. Draw Timestamp
        ctx.fillStyle = '#000';
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(format(moment.timestamp, 'HH:mm'), centerX, CANVAS_SIZE - 40);

        // Hold frame for 1 second
        await new Promise(r => setTimeout(r, 1000));
      }

      // Add a final 0.5s buffer frame
      await new Promise(r => setTimeout(r, 500));
      
      recorder.stop();
      await recordingPromise;

    } catch (error) {
      console.error("Export failed:", error);
      alert("영상 내보내기에 실패했습니다.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-[#f4f4f0] border-x-2 border-black relative overflow-hidden flex flex-col">
      {/* Header */}
      <header className="p-6 border-b-2 border-black bg-white sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="font-display font-bold text-2xl tracking-tighter uppercase">ShapeFrame</h1>
          <p className="text-xs font-mono text-neutral-500">{format(new Date(), 'yyyy.MM.dd')}</p>
        </div>
        {view === 'timeline' && (
          <div className="flex gap-2">
            {moments.length > 0 && (
              <button 
                onClick={exportDailyVideo}
                disabled={isExporting}
                className="w-10 h-10 bg-white brutal-button flex items-center justify-center rounded-full disabled:opacity-50"
                title="Export Daily Video"
              >
                {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Film className="w-5 h-5" />}
              </button>
            )}
            <button 
              onClick={() => setView('select-shape')}
              className="w-10 h-10 bg-[#D4FF33] brutal-button flex items-center justify-center rounded-full"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        )}
      </header>

      {/* Main Canvas / Timeline */}
      <main className="flex-1 p-6 overflow-y-auto">
        {moments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-4">
            <div className="w-24 h-24 border-2 border-dashed border-black rounded-full flex items-center justify-center">
              <Camera className="w-8 h-8" />
            </div>
            <p className="font-mono text-sm">No moments recorded today.<br/>Choose a shape and capture.</p>
          </div>
        ) : (
          <div className="space-y-12 relative pb-20">
            {/* Timeline Line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-black/10 -translate-x-1/2 z-0" />
            
            {/* Display moments in reverse order (newest first) for the timeline */}
            {[...moments].reverse().map((moment, idx) => (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                key={moment.id} 
                className={cn(
                  "relative z-10 flex flex-col items-center gap-4",
                  idx % 2 === 0 ? "items-start" : "items-end"
                )}
              >
                <div className="bg-white brutal-border p-3 flex flex-col gap-3 w-4/5">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs font-bold px-2 py-1 bg-black text-white uppercase">
                      {format(moment.timestamp, 'HH:mm')}
                    </span>
                    <span className="font-mono text-xs text-neutral-500 uppercase">
                      {SHAPES[moment.shape].label}
                    </span>
                  </div>
                  
                  <div className="w-full flex justify-center bg-[#f4f4f0] p-4 border-2 border-black">
                    <div 
                      className="w-full max-w-[200px] bg-black"
                      style={{ 
                        aspectRatio: SHAPES[moment.shape].aspectRatio,
                        clipPath: SHAPES[moment.shape].clipPath,
                        filter: 'drop-shadow(2px 2px 0px rgba(0,0,0,1))'
                      }}
                    >
                      <img 
                        src={moment.imageUrl} 
                        alt="Moment" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Overlays */}
      <AnimatePresence>
        {/* Shape Selection Overlay */}
        {view === 'select-shape' && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 bg-white z-50 flex flex-col"
          >
            <div className="p-4 border-b-2 border-black flex justify-between items-center bg-[#f4f4f0]">
              <h2 className="font-display font-bold text-lg uppercase">Select Frame</h2>
              <button onClick={() => setView('timeline')} className="p-2">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 p-6 grid grid-cols-2 gap-4 content-center bg-[#f4f4f0]">
              {(Object.entries(SHAPES) as [ShapeType, typeof SHAPES[ShapeType]][]).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => handleShapeSelect(key as ShapeType)}
                  className="aspect-square bg-white brutal-button flex flex-col items-center justify-center gap-4 hover:bg-[#D4FF33] transition-colors group"
                >
                  <div className="transform group-hover:scale-110 transition-transform">
                    {value.icon}
                  </div>
                  <span className="font-mono text-sm font-bold uppercase">{value.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Camera Overlay */}
        {view === 'camera' && selectedShape && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black z-50 flex flex-col"
          >
            <div className="p-4 flex justify-between items-center text-white z-10 absolute top-0 left-0 right-0">
              <h2 className="font-display font-bold text-lg uppercase drop-shadow-md">Capture</h2>
              <button onClick={() => setView('select-shape')} className="p-2 drop-shadow-md">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
              {/* Camera Feed */}
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="absolute inset-0 w-full h-full object-cover opacity-50"
              />
              
              {/* Shape Mask Overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-8">
                <div 
                  className="w-full max-w-[300px] relative"
                  style={{ aspectRatio: SHAPES[selectedShape].aspectRatio }}
                >
                  {/* The clear window through the shape */}
                  <video 
                    autoPlay 
                    playsInline 
                    muted 
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ clipPath: SHAPES[selectedShape].clipPath }}
                    ref={(el) => {
                      // Sync the second video element with the same stream
                      if (el && streamRef.current) {
                        el.srcObject = streamRef.current;
                      }
                    }}
                  />
                  {/* Border guide */}
                  <div 
                    className="absolute inset-0 border-4 border-[#D4FF33] opacity-80"
                    style={{ clipPath: SHAPES[selectedShape].clipPath }}
                  />
                </div>
              </div>
            </div>

            {/* Capture Button */}
            <div className="p-8 pb-12 flex justify-center bg-gradient-to-t from-black to-transparent absolute bottom-0 left-0 right-0">
              <button
                onClick={handleCapture}
                className="w-20 h-20 bg-white rounded-full border-4 border-[#D4FF33] flex items-center justify-center active:scale-95 transition-transform"
              >
                <div className="w-16 h-16 bg-white rounded-full border-2 border-black" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Exporting Overlay */}
      <AnimatePresence>
        {isExporting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center text-white"
          >
            <Loader2 className="w-12 h-12 animate-spin mb-4 text-[#D4FF33]" />
            <h3 className="font-display font-bold text-xl uppercase">Generating Video</h3>
            <p className="font-mono text-sm opacity-70 mt-2">Stitching your moments...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Plus, X, Circle, Square, Triangle, RectangleHorizontal, Film, Loader2, CheckCircle2, Download, Share2, Instagram, Twitter, MessageCircle, Info } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from './lib/utils';

type ShapeType = 'circle' | 'square' | 'triangle' | 'pill';

interface Moment {
  id: string;
  imageUrl: string;
  shape: ShapeType;
  timestamp: Date;
}

const SHAPES: Record<ShapeType, { 
  label: string; 
  icon: React.ReactNode; 
  aspectRatio: string; 
  clipPath: string;
  renderGuide: () => React.ReactNode; 
  renderMask: (ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) => void 
}> = {
  circle: { 
    label: '원', 
    icon: <Circle className="w-8 h-8" />, 
    aspectRatio: '1/1', 
    clipPath: 'circle(50% at 50% 50%)',
    renderGuide: () => <div className="w-full h-full rounded-full border-2 border-[#D4FF33] shadow-[0_0_15px_rgba(212,255,51,0.5)]" />,
    renderMask: (ctx, cx, cy, w, h) => { ctx.arc(cx, cy, w/2, 0, Math.PI * 2); }
  },
  square: { 
    label: '사각형', 
    icon: <Square className="w-8 h-8" />, 
    aspectRatio: '1/1', 
    clipPath: 'inset(0)',
    renderGuide: () => <div className="w-full h-full border-2 border-[#D4FF33] shadow-[0_0_15px_rgba(212,255,51,0.5)]" />,
    renderMask: (ctx, cx, cy, w, h) => { ctx.rect(cx - w/2, cy - h/2, w, h); }
  },
  triangle: { 
    label: '삼각형', 
    icon: <Triangle className="w-8 h-8" />, 
    aspectRatio: '1/1', 
    clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
    renderGuide: () => (
      <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points="50,0 0,100 100,100" fill="none" stroke="#D4FF33" strokeWidth="2" filter="drop-shadow(0 0 10px rgba(212,255,51,0.5))" />
      </svg>
    ),
    renderMask: (ctx, cx, cy, w, h) => { 
      ctx.moveTo(cx, cy - h/2);
      ctx.lineTo(cx + w/2, cy + h/2);
      ctx.lineTo(cx - w/2, cy + h/2);
    }
  },
  pill: { 
    label: '알약', 
    icon: <RectangleHorizontal className="w-8 h-8" />, 
    aspectRatio: '2/3', 
    clipPath: 'inset(0 round 9999px)',
    renderGuide: () => <div className="w-full h-full rounded-full border-2 border-[#D4FF33] shadow-[0_0_15px_rgba(212,255,51,0.5)]" />,
    renderMask: (ctx, cx, cy, w, h) => { 
      if (ctx.roundRect) {
        ctx.roundRect(cx - w/2, cy - h/2, w, h, w/2);
      } else {
        ctx.rect(cx - w/2, cy - h/2, w, h);
      }
    }
  },
};

type ViewState = 'timeline' | 'select-shape' | 'camera';

export default function App() {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [view, setView] = useState<ViewState>('timeline');
  const [selectedShape, setSelectedShape] = useState<ShapeType | null>(null);
  type ExportStep = 'none' | 'select-bgm' | 'exporting' | 'done';
  const [exportStep, setExportStep] = useState<ExportStep>('none');
  const [selectedBgm, setSelectedBgm] = useState<string>('none');
  const [exportedFile, setExportedFile] = useState<File | null>(null);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return !localStorage.getItem('shapeframe_onboarded');
    } catch {
      return true;
    }
  });

  const dismissOnboarding = () => {
    try {
      localStorage.setItem('shapeframe_onboarded', 'true');
    } catch {}
    setShowOnboarding(false);
  };
  
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
    
    // Target 9:16 aspect ratio
    const targetRatio = 9 / 16;
    const videoRatio = video.videoWidth / video.videoHeight;
    
    let drawWidth = video.videoWidth;
    let drawHeight = video.videoHeight;
    let startX = 0;
    let startY = 0;

    if (videoRatio > targetRatio) {
      // Video is wider than 9:16, crop width
      drawWidth = video.videoHeight * targetRatio;
      startX = (video.videoWidth - drawWidth) / 2;
    } else {
      // Video is taller than 9:16, crop height
      drawHeight = video.videoWidth / targetRatio;
      startY = (video.videoHeight - drawHeight) / 2;
    }

    // Set canvas to a standard 9:16 resolution (1080x1920)
    canvas.width = 1080;
    canvas.height = 1920;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, startX, startY, drawWidth, drawHeight, 0, 0, canvas.width, canvas.height);
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

  const createAudioStream = (type: string): { stream: MediaStream, stop: () => void } | null => {
    if (type === 'none') return null;
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.15;
    masterGain.connect(dest);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = type === 'lofi' ? 400 : 800;
    filter.connect(masterGain);

    const oscillators: OscillatorNode[] = [];
    
    const playChord = (frequencies: number[], oscType: OscillatorType) => {
      frequencies.forEach(freq => {
        const osc = ctx.createOscillator();
        osc.type = oscType;
        osc.frequency.value = freq;
        osc.connect(filter);
        osc.start();
        oscillators.push(osc);
      });
    };

    if (type === 'ambient') {
      playChord([261.63, 329.63, 392.00, 493.88], 'sine'); // Cmaj7
    } else if (type === 'lofi') {
      playChord([220.00, 261.63, 329.63, 392.00], 'triangle'); // Amin7
    }

    return { 
      stream: dest.stream, 
      stop: () => {
        oscillators.forEach(osc => osc.stop());
        ctx.close();
      }
    };
  };

  const startExport = async () => {
    if (moments.length === 0) return;
    setExportStep('exporting');

    try {
      const canvas = document.createElement('canvas');
      const CANVAS_WIDTH = 1080;
      const CANVAS_HEIGHT = 1920;
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas context not available");

      const canvasStream = canvas.captureStream(30);
      const audioSetup = createAudioStream(selectedBgm);
      
      const tracks = [...canvasStream.getVideoTracks()];
      if (audioSetup) {
        tracks.push(...audioSetup.stream.getAudioTracks());
      }
      const mixedStream = new MediaStream(tracks);

      let mimeType = 'video/webm';
      if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
        mimeType = 'video/webm;codecs=h264';
      }

      const recorder = new MediaRecorder(mixedStream, { mimeType });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recordingPromise = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const file = new File([blob], `shapeframe-${format(new Date(), 'yyyyMMdd')}.mp4`, { type: mimeType });
          setExportedFile(file);
          setExportedUrl(URL.createObjectURL(blob));
          resolve();
        };
      });

      recorder.start();

      // Draw frames
      for (const moment of moments) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const img = new Image();
        img.src = moment.imageUrl;
        await new Promise((resolve) => { img.onload = resolve; });

        ctx.save();
        ctx.beginPath();
        
        const centerX = CANVAS_WIDTH / 2;
        const centerY = CANVAS_HEIGHT / 2;
        const shapeWidth = CANVAS_WIDTH * 0.74;
        const shapeHeight = moment.shape === 'pill' ? shapeWidth * 1.5 : shapeWidth;

        SHAPES[moment.shape].renderMask(ctx, centerX, centerY, shapeWidth, shapeHeight);
        
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(format(moment.timestamp, 'yyyy.MM.dd HH:mm'), centerX, CANVAS_HEIGHT - 120);

        await new Promise(r => setTimeout(r, 500));
      }

      await new Promise(r => setTimeout(r, 500));
      
      recorder.stop();
      if (audioSetup) audioSetup.stop();
      await recordingPromise;

      setExportStep('done');
    } catch (error) {
      console.error("Export failed:", error);
      alert("영상 내보내기에 실패했습니다.");
      setExportStep('none');
    }
  };

  const handleDownload = () => {
    if (!exportedUrl || !exportedFile) return;
    const a = document.createElement('a');
    a.href = exportedUrl;
    a.download = exportedFile.name;
    a.click();
  };

  const handleShare = async () => {
    if (!exportedFile) return;
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [exportedFile] })) {
      try {
        await navigator.share({
          title: 'ShapeFrame',
          text: '나의 하루를 도형으로 기록했어요! 🔴⬛️🔺',
          files: [exportedFile]
        });
      } catch (e) {
        console.log('Share canceled or failed', e);
      }
    } else {
      alert('현재 브라우저에서는 파일 직접 공유를 지원하지 않습니다. 기기에 저장한 후 인스타/카카오톡/X에 업로드해주세요!');
      handleDownload();
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
            <button 
              onClick={() => setShowOnboarding(true)}
              className="w-10 h-10 bg-white brutal-button flex items-center justify-center rounded-full"
              title="앱 설명 보기"
            >
              <Info className="w-5 h-5" />
            </button>
            {moments.length > 0 && (
              <button 
                onClick={() => setExportStep('select-bgm')}
                disabled={exportStep !== 'none'}
                className="w-10 h-10 bg-white brutal-button flex items-center justify-center rounded-full disabled:opacity-50"
                title="오늘의 영상 내보내기"
              >
                {exportStep === 'exporting' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Film className="w-5 h-5" />}
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
            <p className="font-mono text-sm">오늘 기록된 매치 컷이 없습니다.<br/>도형을 선택하고 촬영해보세요.</p>
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
                      className="relative bg-black overflow-hidden"
                      style={{ 
                        width: '74%',
                        aspectRatio: SHAPES[moment.shape].aspectRatio,
                        clipPath: SHAPES[moment.shape].clipPath,
                      }}
                    >
                      <img 
                        src={moment.imageUrl} 
                        alt="Moment" 
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-none"
                        style={{ 
                          width: `${100 / 0.74}%`,
                          aspectRatio: '9/16',
                          objectFit: 'cover'
                        }}
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
              <h2 className="font-display font-bold text-lg uppercase">프레임 선택</h2>
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
              <h2 className="font-display font-bold text-lg uppercase drop-shadow-md">촬영</h2>
              <button onClick={() => setView('select-shape')} className="p-2 drop-shadow-md">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black">
              <div className="relative w-full max-w-sm" style={{ aspectRatio: '9/16' }}>
                {/* Camera Feed */}
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="absolute inset-0 w-full h-full object-cover"
                />
                
                {/* Onion Skin (Previous Frame for Match Cut) */}
                {selectedShape && [...moments].reverse().find(m => m.shape === selectedShape) && (
                  <img 
                    src={[...moments].reverse().find(m => m.shape === selectedShape)!.imageUrl} 
                    alt="Previous frame" 
                    className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen pointer-events-none"
                  />
                )}
                
                {/* Shape Mask Overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div 
                    className="relative"
                    style={{ 
                      width: '74%',
                      aspectRatio: SHAPES[selectedShape].aspectRatio 
                    }}
                  >
                    {SHAPES[selectedShape].renderGuide()}
                  </div>
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
      
      {/* Export Modals */}
      <AnimatePresence>
        {exportStep === 'select-bgm' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center p-6"
          >
            <div className="bg-white p-6 w-full max-w-sm brutal-border flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <h3 className="font-display font-bold text-xl uppercase">배경음 선택</h3>
                <button onClick={() => setExportStep('none')}><X className="w-6 h-6" /></button>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { id: 'none', label: '배경음 없음' },
                  { id: 'ambient', label: '잔잔한 앰비언트' },
                  { id: 'lofi', label: '로파이 바이브' }
                ].map(bgm => (
                  <button
                    key={bgm.id}
                    onClick={() => setSelectedBgm(bgm.id)}
                    className={cn(
                      "p-4 border-2 border-black text-left font-mono font-bold flex justify-between items-center transition-colors",
                      selectedBgm === bgm.id ? "bg-[#D4FF33]" : "bg-white hover:bg-gray-100"
                    )}
                  >
                    {bgm.label}
                    {selectedBgm === bgm.id && <CheckCircle2 className="w-5 h-5" />}
                  </button>
                ))}
              </div>
              <button
                onClick={startExport}
                className="w-full py-4 bg-black text-white font-display font-bold text-lg uppercase brutal-button mt-2"
              >
                영상 만들기
              </button>
            </div>
          </motion.div>
        )}

        {exportStep === 'exporting' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center text-white"
          >
            <Loader2 className="w-12 h-12 animate-spin mb-4 text-[#D4FF33]" />
            <h3 className="font-display font-bold text-xl uppercase">영상 생성 중</h3>
            <p className="font-mono text-sm opacity-70 mt-2">순간들을 이어붙이는 중...</p>
          </motion.div>
        )}

        {exportStep === 'done' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#D4FF33] z-[100] flex flex-col items-center justify-center p-6"
          >
            <div className="bg-white p-8 w-full max-w-sm brutal-border flex flex-col items-center gap-6 text-center">
              <div className="w-16 h-16 bg-black text-[#D4FF33] rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="font-display font-bold text-2xl uppercase">저장 완료!</h3>
                <p className="font-mono text-sm mt-2 text-gray-600">영상이 성공적으로 만들어졌습니다.<br/>mp4 형식으로 저장됩니다.</p>
              </div>
              
              <div className="w-full flex flex-col gap-3 mt-4">
                <button
                  onClick={handleDownload}
                  className="w-full py-4 bg-white border-2 border-black font-display font-bold text-lg uppercase brutal-button flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  기기에 저장하기
                </button>
                <button
                  onClick={handleShare}
                  className="w-full py-4 bg-black text-white font-display font-bold text-lg uppercase brutal-button flex items-center justify-center gap-2"
                >
                  <Share2 className="w-5 h-5" />
                  SNS 공유하기
                </button>
              </div>
              
              <div className="flex gap-4 mt-2 text-gray-400">
                <Instagram className="w-6 h-6" />
                <MessageCircle className="w-6 h-6" />
                <Twitter className="w-6 h-6" />
              </div>

              <button
                onClick={() => {
                  setExportStep('none');
                  setExportedFile(null);
                  setExportedUrl(null);
                }}
                className="mt-4 font-mono text-sm underline underline-offset-4"
              >
                닫기
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Overlay */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#D4FF33] z-[200] flex flex-col p-6"
          >
            <div className="flex-1 flex flex-col justify-center space-y-8">
              <div className="space-y-4">
                <h1 className="font-display font-bold text-4xl uppercase tracking-tighter">ShapeFrame</h1>
                <p className="font-mono text-lg font-bold">도형으로 만드는 매치 컷 영상</p>
              </div>
              
              <div className="space-y-6 bg-white brutal-border p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center font-bold shrink-0">1</div>
                  <p className="font-mono text-sm mt-1">원하는 <strong>도형 프레임</strong>을 선택하세요.</p>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center font-bold shrink-0">2</div>
                  <p className="font-mono text-sm mt-1">이전 장면의 잔상(오니언 스킨)에 맞춰 <strong>매치 컷</strong>을 촬영하세요.</p>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center font-bold shrink-0">3</div>
                  <p className="font-mono text-sm mt-1">장면들을 이어붙여 <strong>감각적인 매치 컷 영상</strong>을 완성하세요.</p>
                </div>
              </div>
            </div>
            
            <button
              onClick={dismissOnboarding}
              className="w-full py-4 bg-black text-white font-display font-bold text-xl uppercase brutal-button"
            >
              시작하기
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

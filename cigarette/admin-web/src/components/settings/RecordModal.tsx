"use client";

import React, { useState, useRef, useEffect } from "react";
import { LuX, LuMic, LuSquare, LuCheck } from "react-icons/lu";
import { useAlert } from "@/components/ui/AlertProvider";
import AudioTrimmer from "./AudioTrimmer";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (file: File, name: string, category: string, description: string | null, duration: number) => void;
  defaultCategory?: string; // e.g. "ENCOURAGEMENT" or "UI", determines what we start with
  initialFile?: File | null;
}

export default function RecordModal({ isOpen, onClose, onSave, defaultCategory = "ENCOURAGEMENT", initialFile = null }: Props) {
  const { showAlert } = useAlert();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [trimmedAudioBlob, setTrimmedAudioBlob] = useState<Blob | null>(null);
  const [trimmedAudioUrl, setTrimmedAudioUrl] = useState<string | null>(null);
  const [trimStart, setTrimStart] = useState<number | undefined>(undefined);
  const [trimEnd, setTrimEnd] = useState<number | undefined>(undefined);
  
  const [soundName, setSoundName] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [description, setDescription] = useState("");
  const [step, setStep] = useState<"record" | "trim" | "save">("record");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);
  const visualizerAnimationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      handleReset();
    } else {
      setCategory(defaultCategory);
      if (initialFile) {
        // Automatically skip to trim step for uploaded file
        setSoundName(initialFile.name.replace(/\.[^/.]+$/, ""));
        setAudioBlob(initialFile);
        setAudioUrl(URL.createObjectURL(initialFile));
        setStep("trim");
      }
    }
  }, [isOpen, defaultCategory, initialFile]);

  const handleReset = () => {
    if (isRecording) stopRecording();
    setAudioUrl(null);
    setAudioBlob(null);
    setTrimmedAudioBlob(null);
    setTrimmedAudioUrl(null);
    setTrimStart(undefined);
    setTrimEnd(undefined);
    setSoundName("");
    setDescription("");
    setRecordingTime(0);
    setStep("record");
    audioChunksRef.current = [];
    cleanupAudioContext();
  };

  const cleanupAudioContext = () => {
    if (visualizerAnimationRef.current) cancelAnimationFrame(visualizerAnimationRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(console.error);
    }
    audioContextRef.current = null;
    analyserRef.current = null;
  };

  const drawVisualizer = () => {
    if (!analyserRef.current || !visualizerCanvasRef.current) return;
    
    const canvas = visualizerCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    analyserRef.current.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Calculate average volume to pulse the center mic button
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const avg = sum / bufferLength;
    
    // Google-style pulsing circle behind the button
    // The button is 96x96 (radius 48), so base radius should be slightly larger to peek out, e.g., 50.
    // It scales up significantly based on volume.
    const pulseRadius = 50 + (avg / 255) * 60;

    // Draw solid, semi-transparent circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, pulseRadius, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(79, 70, 229, 0.4)"; // indigo-600 with 40% opacity
    ctx.fill();

    visualizerAnimationRef.current = requestAnimationFrame(drawVisualizer);
  };

  const startRecording = async () => {
    try {
      let stream: MediaStream;

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        const legacyGetUserMedia = 
          (navigator as any).getUserMedia || 
          (navigator as any).webkitGetUserMedia || 
          (navigator as any).mozGetUserMedia || 
          (navigator as any).msGetUserMedia;

        if (legacyGetUserMedia) {
          stream = await new Promise((resolve, reject) => {
            legacyGetUserMedia.call(navigator, { audio: true }, resolve, reject);
          });
        } else {
        showAlert({ message: "เบราว์เซอร์นี้ไม่รองรับการบันทึกเสียง หรือถูกบล็อกโดยระบบความปลอดภัย", type: "error" });
          return;
        }
      }

      // Set up AudioContext for visualizer
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 64; // Small size for smooth circular wave
      
      if (visualizerCanvasRef.current) {
        drawVisualizer();
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        cleanupAudioContext();
        let mimeType = mediaRecorder.mimeType;
        if (!mimeType) {
          mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(audioBlob);
        setAudioBlob(audioBlob);
        setAudioUrl(url);
        setStep("trim");
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      const error = err as Error;
      console.error("Microphone error:", error);
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        showAlert({ message: "ถูกเบราว์เซอร์ปฏิเสธการเข้าถึงไมโครโฟน กรุณาอนุญาตการเข้าถึงไมโครโฟนก่อนใช้งาน", type: "warning" });
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        showAlert({ message: "ไม่พบไมโครโฟนในอุปกรณ์ของคุณ", type: "error" });
      } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        showAlert({ message: "ไมโครโฟนกำลังถูกใช้งานโดยแอปพลิเคชันอื่น", type: "error" });
      } else {
        showAlert({ message: "ไม่สามารถเข้าถึงไมโครโฟนได้: " + error.message, type: "error" });
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      cleanupAudioContext();
    }
  };

  const handleTrimComplete = (trimmedBlob: Blob, start: number, end: number) => {
    setTrimmedAudioBlob(trimmedBlob);
    setTrimmedAudioUrl(URL.createObjectURL(trimmedBlob));
    setTrimStart(start);
    setTrimEnd(end);
    setStep("save");
  };

  const handleSave = () => {
    if (!trimmedAudioBlob || !soundName.trim()) return;
    if (category === "ENCOURAGEMENT" && !description.trim()) return;
    
    // Ensure size is less than 1MB (1048576 bytes) for Nginx compatibility
    if (trimmedAudioBlob.size > 1040000) {
      showAlert({ message: "ไฟล์เสียงมีขนาดใหญ่เกินไป (เกิน 1MB) อัปโหลดจะไม่สำเร็จ กรุณาตัดเสียงให้สั้นลงอีกครับ!", type: "warning" });
      return;
    }
    
    // Using standard WAV extension — universally playable
    const file = new File([trimmedAudioBlob], `${soundName}.wav`, { type: "audio/wav" });
    onSave(file, soundName.trim(), category, category === "ENCOURAGEMENT" ? description.trim() : null, recordingTime || 1);
    onClose();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">
            {step === "record" ? "อัดเสียงใหม่" : step === "trim" ? "ตัดเสียง" : "บันทึกเสียง"}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/50 transition">
            <LuX size={20} />
          </button>
        </div>

        {step === "record" && (
          <div className="flex flex-col items-center py-8">
            <div className="w-32 h-32 rounded-full flex items-center justify-center mb-6 relative">
              {/* Visualizer Canvas exactly behind the button */}
              <canvas 
                ref={visualizerCanvasRef} 
                width={240}
                height={240}
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] h-[240px] pointer-events-none transition-opacity duration-300 ${isRecording ? "opacity-100" : "opacity-0"}`} 
              />
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-xl relative z-10 ${isRecording ? "bg-red-500 hover:bg-red-600 shadow-red-500/40" : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/40"}`}
              >
                {isRecording ? <LuSquare size={32} className="text-white fill-current" /> : <LuMic size={36} className="text-white" />}
              </button>
            </div>
            
            <div className="text-3xl font-mono font-bold text-white mb-2 relative z-10">
              {formatTime(recordingTime)}
            </div>
            <p className="text-white/50 relative z-10">
              {isRecording ? "กำลังอัดเสียง... (กดปุ่มเพื่อหยุด)" : "กดปุ่มไมโครโฟนเพื่อเริ่มอัดเสียง"}
            </p>
          </div>
        )}

        {step === "trim" && audioBlob && audioUrl && (
          <AudioTrimmer 
            audioUrl={audioUrl} 
            audioBlob={audioBlob}
            initialStartTime={trimStart}
            initialEndTime={trimEnd}
            onTrim={handleTrimComplete} 
            onCancel={() => setStep("record")}
          />
        )}

        {step === "save" && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-white/5 flex flex-col gap-2">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-green-400 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                    พร้อมสำหรับบันทึก
                  </div>
                  <button onClick={() => setStep("trim")} className="text-xs text-indigo-400 whitespace-nowrap bg-indigo-500/10 px-3 py-1.5 rounded-lg hover:bg-indigo-500/20 transition-colors">
                    ตัดเสียงใหม่
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-white/30 text-right mt-1">
                File size: {trimmedAudioBlob ? (trimmedAudioBlob.size / 1024).toFixed(2) : 0} KB
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                หมวดหมู่ <span className="text-red-400">*</span>
              </label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ENCOURAGEMENT" className="bg-slate-900">เสียงให้กำลังใจ (ในหน้า SOS)</option>
                <option value="UI" className="bg-slate-900">เสียง UI (ปุ่มกด / แจ้งเตือน)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                ชื่อเสียง <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={soundName}
                onChange={(e) => setSoundName(e.target.value)}
                placeholder="เช่น เสียงเตือนใจจากแม่"
                className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white placeholder-white/30 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {category === "ENCOURAGEMENT" && (
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  คำอธิบาย หรือ ข้อความเสียง <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="เช่น ลูกต้องทำได้ สู้ๆนะ"
                  className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white placeholder-white/30 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 h-24 resize-none"
                />
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setStep("record")}
                className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors"
              >
                อัดใหม่
              </button>
              <button
                onClick={handleSave}
                disabled={!soundName.trim() || (category === "ENCOURAGEMENT" && !description.trim())}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                <LuCheck size={18} />
                บันทึกเข้าสู่ระบบ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

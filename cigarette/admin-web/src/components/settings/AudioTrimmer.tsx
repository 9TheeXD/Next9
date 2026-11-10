"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { LuScissors, LuPlay, LuPause, LuRotateCcw, LuRotateCw, LuMapPin } from "react-icons/lu";
import { useAlert } from "@/components/ui/AlertProvider";
import { trimAudioBlob, trimAudioBuffer } from "@/lib/audioUtils";

interface Props {
  audioUrl: string;
  audioBlob?: Blob;
  initialStartTime?: number;
  initialEndTime?: number;
  onTrim: (blob: Blob, start: number, end: number) => void;
  onCancel: () => void;
}

export default function AudioTrimmer({ audioUrl, audioBlob, initialStartTime, initialEndTime, onTrim, onCancel }: Props) {
  const { showAlert } = useAlert();
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  
  const [isAudioDecoded, setIsAudioDecoded] = useState(false);
  const [decodeError, setDecodeError] = useState(false);
  const [isApplyingTrim, setIsApplyingTrim] = useState(false);
  
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);

  const isProcessing = !isAudioDecoded;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);

  useEffect(() => {
    const loadAudio = async () => {
      try {
        let blob = audioBlob;
        if (!blob) {
          const response = await fetch(audioUrl);
          blob = await response.blob();
        }
        setOriginalBlob(blob);
        
        const arrayBuffer = await blob.arrayBuffer();
        
        let decodedBuffer = null;
        let ac = audioCtxRef.current;
        if (!ac) {
           ac = new (window.AudioContext || (window as any).webkitAudioContext)();
           audioCtxRef.current = ac;
        }

        try {
          decodedBuffer = await ac.decodeAudioData(arrayBuffer);
        } catch (ctxErr) {
          console.warn("AudioContext creation or decode failed:", ctxErr);
        }

        if (decodedBuffer) {
          setAudioBuffer(decodedBuffer);
          setDuration(decodedBuffer.duration);
          setEndTime(initialEndTime !== undefined ? initialEndTime : decodedBuffer.duration);
          setStartTime(initialStartTime || 0);
          
          setTimeout(() => drawWaveform(decodedBuffer), 50);
          setIsAudioDecoded(true);
        } else {
          setDecodeError(true);
          setIsAudioDecoded(true);
        }
      } catch (err) {
        console.error("Error loading audio:", err);
        setDecodeError(true);
        setIsAudioDecoded(true);
      }
    };

    loadAudio();
  }, [audioUrl, audioBlob, initialStartTime, initialEndTime]);

  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(console.error);
      }
    };
  }, []);

  const drawWaveform = (buffer: AudioBuffer | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#4f46e5";
    
    if (!buffer) {
       ctx.beginPath();
       for (let i = 0; i < width; i++) {
         const y = Math.sin(i * 0.05) * (height / 4) * Math.sin(i * 0.01);
         if (i === 0) ctx.moveTo(i, height / 2 - y);
         else ctx.lineTo(i, height / 2 - y);
       }
       ctx.stroke();
       return;
    }

    const rawData = buffer.getChannelData(0);
    const samples = width;
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData = [];

    for (let i = 0; i < samples; i++) {
      let blockStart = blockSize * i;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum = sum + Math.abs(rawData[blockStart + j]);
      }
      filteredData.push(sum / blockSize);
    }

    const multiplier = Math.pow(Math.max(...filteredData), -1);
    const normalizedData = filteredData.map(n => n * multiplier);

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#4f46e5";
    
    ctx.beginPath();
    for (let i = 0; i < width; i++) {
      const x = i;
      const y = (normalizedData[i] * height) / 2;
      ctx.moveTo(x, height / 2 - y);
      ctx.lineTo(x, height / 2 + y);
    }
    ctx.stroke();
  };

  const stopPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null;
      try { sourceNodeRef.current.stop(); } catch (e) {}
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const updateProgress = useCallback(() => {
    if (isPlayingRef.current && audioCtxRef.current) {
      let newTime = audioCtxRef.current.currentTime - playStartTimeRef.current;
      if (newTime >= endTime) {
        newTime = endTime;
        setCurrentTime(newTime);
        stopPlayback();
        return;
      }
      setCurrentTime(newTime);
      animationRef.current = requestAnimationFrame(updateProgress);
    }
  }, [endTime, stopPlayback]);

  const playFrom = async (time: number) => {
    if (!audioBuffer || !audioCtxRef.current) return;
    
    stopPlayback();
    
    const durationToPlay = endTime - time;
    if (durationToPlay <= 0) return;
    
    if (audioCtxRef.current.state === 'suspended') {
      try {
        await audioCtxRef.current.resume();
      } catch (e) {
        console.warn("Failed to resume AudioContext", e);
      }
    }
    
    const source = audioCtxRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtxRef.current.destination);
    
    source.onended = () => {
      stopPlayback();
      setCurrentTime(endTime);
    };
    
    source.start(0, time, durationToPlay);
    sourceNodeRef.current = source;
    
    setIsPlaying(true);
    isPlayingRef.current = true;
    playStartTimeRef.current = audioCtxRef.current.currentTime - time;
    
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(updateProgress);
  };

  const togglePlay = () => {
    if (isPlayingRef.current) {
      stopPlayback();
    } else {
      let startOffset = currentTime;
      if (startOffset < startTime || startOffset >= endTime) {
        startOffset = startTime;
        setCurrentTime(startTime);
      }
      playFrom(startOffset);
    }
  };

  const skip = (amount: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + amount));
    setCurrentTime(newTime);
    
    if (isPlaying) {
      playFrom(newTime);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    setCurrentTime(newTime);
    if (isPlaying) {
      playFrom(newTime);
    }
  };

  const handleApplyTrim = async () => {
    if (!originalBlob || !audioBuffer) return;
    
    stopPlayback();
    setIsApplyingTrim(true);
    
    try {
      const trimmedBlob = await trimAudioBuffer(audioBuffer, startTime, endTime);
      
      if (trimmedBlob.size < 100) {
        throw new Error("ไฟล์ที่ตัดแล้วมีขนาดเล็กผิดปกติ (ล้มเหลว)");
      }
      
      setTimeout(() => {
        onTrim(trimmedBlob, startTime, endTime);
      }, 800);
      
    } catch (err) {
      showAlert({ message: "เกิดข้อผิดพลาดในการตัดเสียง: " + err, type: "error" });
      setIsApplyingTrim(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
  };

  const adjustStart = (amount: number) => {
    const newStart = Math.max(0, Math.min(endTime - 0.5, startTime + amount));
    setStartTime(newStart);
    if (currentTime < newStart) setCurrentTime(newStart);
  };
  
  const adjustEnd = (amount: number) => {
    const newEnd = Math.max(startTime + 0.5, Math.min(duration, endTime + amount));
    setEndTime(newEnd);
    if (currentTime > newEnd) setCurrentTime(newEnd);
  };

  if (decodeError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-red-400">
        <p className="mb-4">ไม่สามารถประมวลผลไฟล์เสียงนี้ได้ (Browser อาจไม่รองรับรูปแบบเสียง)</p>
        <button onClick={onCancel} className="bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20 transition text-white text-sm">
          อัดใหม่
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full py-4 relative">
      {(isProcessing || isApplyingTrim) && !decodeError && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm rounded-xl">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white">{isApplyingTrim ? "กำลังตัดเสียง..." : "กำลังเตรียมคลื่นเสียงให้พร้อม..."}</p>
        </div>
      )}

      <div className="w-full bg-white/5 rounded-xl p-4 mb-6 relative">
            <div className="flex items-center justify-between text-xs text-white/50 mb-2">
              <span>{formatTime(0)}</span>
              <span>{formatTime(duration)}</span>
            </div>
        
        <div className="relative h-24 bg-black/40 rounded-lg overflow-hidden flex items-center group">
          <canvas 
            ref={canvasRef} 
            width={800} 
            height={96} 
            className="w-full h-full cursor-pointer"
            onClick={handleCanvasClick}
          />
          
          <div className="absolute inset-y-0 left-0 bg-black/60 pointer-events-none" style={{ width: `${(startTime / duration) * 100}%` }} />
          <div className="absolute inset-y-0 right-0 bg-black/60 pointer-events-none" style={{ width: `${(1 - endTime / duration) * 100}%` }} />
          
          <div className="absolute top-0 bottom-0 w-0.5 bg-indigo-400 z-10" style={{ left: `${(startTime / duration) * 100}%` }} />
          
          <div className="absolute top-0 bottom-0 w-0.5 bg-indigo-400 z-10" style={{ left: `${(endTime / duration) * 100}%` }} />

          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none transition-all duration-75 shadow-[0_0_8px_rgba(239,68,68,1)]"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>

        <div className="text-center mt-3 text-white font-mono text-lg tracking-wider">
          {formatTime(currentTime)}
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 mb-8 w-full">
        <button onClick={() => skip(-10)} className="text-white/60 hover:text-white transition">
          <LuRotateCcw size={24} />
          <span className="text-[10px] block text-center mt-1">-10s</span>
        </button>

        <button
          onClick={togglePlay}
          className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white hover:bg-indigo-500 transition shadow-[0_0_15px_rgba(79,70,229,0.5)]"
        >
          {isPlaying ? <LuPause size={28} className="fill-current" /> : <LuPlay size={28} className="fill-current ml-1" />}
        </button>

        <button onClick={() => skip(10)} className="text-white/60 hover:text-white transition">
          <LuRotateCw size={24} />
          <span className="text-[10px] block text-center mt-1">+10s</span>
        </button>
      </div>

      <div className="w-full grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white/5 rounded-xl p-3 flex flex-col items-center">
          <span className="text-xs text-white/50 mb-2 font-semibold">START AT</span>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => adjustStart(-0.1)} className="w-8 h-8 bg-white/10 rounded hover:bg-white/20 flex items-center justify-center text-white font-mono">-</button>
            <input 
              type="number" 
              step="0.1" 
              value={startTime.toFixed(1)} 
              onChange={(e) => setStartTime(Math.max(0, Math.min(endTime - 0.5, Number(e.target.value))))}
              className="w-16 text-center bg-transparent border-b border-white/20 text-white font-mono outline-none focus:border-indigo-500"
            />
            <button onClick={() => adjustStart(0.1)} className="w-8 h-8 bg-white/10 rounded hover:bg-white/20 flex items-center justify-center text-white font-mono">+</button>
          </div>
          <button 
            onClick={() => setStartTime(Math.min(endTime - 0.5, currentTime))}
            className="text-[10px] bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full flex items-center gap-1 hover:bg-indigo-500/40 transition"
          >
            <LuMapPin size={10} /> Set to current
          </button>
        </div>

        <div className="bg-white/5 rounded-xl p-3 flex flex-col items-center">
          <span className="text-xs text-white/50 mb-2 font-semibold">END AT</span>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => adjustEnd(-0.1)} className="w-8 h-8 bg-white/10 rounded hover:bg-white/20 flex items-center justify-center text-white font-mono">-</button>
            <input 
              type="number" 
              step="0.1" 
              value={endTime.toFixed(1)} 
              onChange={(e) => setEndTime(Math.max(startTime + 0.5, Math.min(duration, Number(e.target.value))))}
              className="w-16 text-center bg-transparent border-b border-white/20 text-white font-mono outline-none focus:border-indigo-500"
            />
            <button onClick={() => adjustEnd(0.1)} className="w-8 h-8 bg-white/10 rounded hover:bg-white/20 flex items-center justify-center text-white font-mono">+</button>
          </div>
          <button 
            onClick={() => setEndTime(Math.max(startTime + 0.5, currentTime))}
            className="text-[10px] bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full flex items-center gap-1 hover:bg-indigo-500/40 transition"
          >
            <LuMapPin size={10} /> Set to current
          </button>
        </div>
      </div>

      <div className="flex gap-3 w-full">
        <button
          onClick={() => {
            stopPlayback();
            onCancel();
          }}
          className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors"
        >
          ยกเลิก
        </button>
        <button
          onClick={handleApplyTrim}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-[0_4px_14px_rgba(79,70,229,0.4)]"
        >
          <LuScissors size={18} />
          ยืนยันการตัด
        </button>
      </div>
    </div>
  );
}

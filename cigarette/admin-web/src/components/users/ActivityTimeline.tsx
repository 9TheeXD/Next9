"use client";

import React from "react";
import { LuFileText, LuMessageCircle, LuAward, LuInfo, LuHeart } from "react-icons/lu";

interface Activity {
  type: string;
  date: string;
  description: string;
  details?: string;
}

interface Props {
  activities: Activity[];
}

export default function ActivityTimeline({ activities }: Props) {
  if (activities.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-white/40">ยังไม่มีประวัติกิจกรรม</p>
      </div>
    );
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "log":
        return <LuFileText size={16} className="text-emerald-400" />;
      case "craving":
        return <LuHeart size={16} className="text-rose-400" />;
      case "badge":
        return <LuAward size={16} className="text-amber-400" />;
      case "quiz":
        return <LuInfo size={16} className="text-violet-400" />;
      case "chat":
        return <LuMessageCircle size={16} className="text-indigo-400" />;
      default:
        return <LuFileText size={16} className="text-white/50" />;
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case "log":
        return "bg-emerald-500/10 border-emerald-500/20";
      case "craving":
        return "bg-rose-500/10 border-rose-500/20";
      case "badge":
        return "bg-amber-500/10 border-amber-500/20";
      case "quiz":
        return "bg-violet-500/10 border-violet-500/20";
      case "chat":
        return "bg-indigo-500/10 border-indigo-500/20";
      default:
        return "bg-white/5 border-white/10";
    }
  };

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold text-white mb-6">ประวัติกิจกรรมล่าสุด</h3>
      
      <div className="relative border-l border-white/10 ml-4 space-y-6">
        {activities.map((activity, idx) => (
          <div key={idx} className="relative pl-6">
            {/* Timeline dot */}
            <div 
              className={`absolute -left-[17px] top-1 h-8 w-8 rounded-full border flex items-center justify-center ${getBgColor(activity.type)} bg-[#1a1f2e]`}
            >
              {getIcon(activity.type)}
            </div>
            
            {/* Content */}
            <div className="glass-card !bg-white/[0.02] p-4 ml-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-white/90">
                  {activity.description}
                </span>
                <span className="text-xs text-white/40 whitespace-nowrap">
                  {new Date(activity.date).toLocaleString("th-TH", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              
              {activity.details && (
                <p className="text-sm text-white/60 leading-relaxed">
                  {activity.details}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

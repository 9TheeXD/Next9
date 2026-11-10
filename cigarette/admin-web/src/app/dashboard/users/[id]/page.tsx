"use client";

import React, { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { LuArrowLeft, LuTrash2, LuPen } from "react-icons/lu";
import { useAlert } from "@/components/ui/AlertProvider";
import UserDetailStats from "@/components/users/UserDetailStats";
import ActivityTimeline from "@/components/users/ActivityTimeline";
import EditUserModal from "@/components/users/EditUserModal";
import { TbEdit } from "react-icons/tb";

interface UserDetailProps {
  params: Promise<{ id: string }>;
}

export default function UserDetailPage({ params }: UserDetailProps) {
  const router = useRouter();
  const { showAlert, showConfirm } = useAlert();
  const { id } = use(params);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = sessionStorage.getItem("__admin_token");
      if (!token) {
        window.location.href = `/login?to=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      const res = await fetch(`/api/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setUser(json.data);
      } else {
        setError(json.error || "ไม่สามารถโหลดข้อมูลผู้ใช้ได้");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async () => {
    const isConfirmed = await showConfirm({
      title: "ยืนยันการลบผู้ใช้",
      message: `คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ ${user.displayName}?\n\nการลบจะไม่สามารถกู้คืนได้ และข้อมูลที่เกี่ยวข้องทั้งหมดจะถูกลบ`,
      isDanger: true,
      confirmText: "ลบข้อมูล"
    });
    if (!isConfirmed) return;

    setIsDeleting(true);
    try {
      const token = sessionStorage.getItem("__admin_token");
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok && json.success) {
        router.push("/dashboard/users");
      } else {
        showAlert({ message: json.error || "ไม่สามารถลบผู้ใช้ได้", type: "error" });
        setIsDeleting(false);
      }
    } catch (err) {
      showAlert({ message: (err as Error).message, type: "error" });
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-24 rounded-lg" />
        <div className="skeleton h-32 rounded-2xl" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-96 rounded-2xl" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-red-400">{error || "ไม่พบผู้ใช้"}</p>
        <button
          onClick={() => router.push("/dashboard/users")}
          className="mt-4 rounded-xl bg-white/10 px-6 py-2 text-sm font-semibold text-white hover:bg-white/20 transition"
        >
          กลับหน้าจัดการผู้ใช้
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 overview-enter pb-10">
      <button
        onClick={() => router.push("/dashboard/users")}
        className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition"
      >
        <LuArrowLeft size={16} />
        กลับไปหน้ารายชื่อ
      </button>

      {/* Header Profile */}
      <div className="glass-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-2xl font-bold uppercase">
            {user.displayName.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              {user.displayName}
              <span className={`status-badge ${user.role === "SMOKER" ? "reducing" : "smoke-free"}`}>
                {user.role === "SMOKER" ? "ผู้สูบ" : "ผู้ติดตาม"}
              </span>
            </h1>
            <p className="text-sm text-white/50 mt-1">
              เบอร์โทร: {user.phoneNumber} • สมัครเมื่อ: {new Date(user.createdAt).toLocaleDateString("th-TH")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 border border-white/10 transition"
          >
            <TbEdit size={16} />
            แก้ไข
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/20 border border-red-500/20 transition disabled:opacity-50"
          >
            <LuTrash2 size={16} />
            {isDeleting ? "กำลังลบ..." : "ลบ"}
          </button>
        </div>
      </div>

      {user.role === "SMOKER" && (
        <UserDetailStats stats={user.stats} smokingType={user.smokingType} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">ข้อมูลเพิ่มเติม</h3>
            
            <div className="space-y-4">
              {user.role === "SMOKER" && (
                <>
                  <div>
                    <p className="text-xs text-white/40 mb-1">ประเภทที่สูบ</p>
                    <p className="text-sm text-white font-medium">{user.smokingType === "POD" ? "พอตไฟฟ้า (POD)" : "บุหรี่มวน (CIGARETTE)"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">เป้าหมายเริ่มต้น (Baseline)</p>
                    <p className="text-sm text-white font-medium">{user.cigarettesPerDay} {user.smokingType === "POD" ? "พัฟ" : "มวน"} ต่อวัน</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">ราคาเฉลี่ยต่อซอง</p>
                    <p className="text-sm text-white font-medium">฿{user.pricePerPack} ({user.cigarettesPerPack} มวน/ซอง)</p>
                  </div>
                </>
              )}
              
              <div>
                <p className="text-xs text-white/40 mb-1">XP ปัจจุบัน</p>
                <p className="text-sm text-amber-400 font-bold">{user.xp} XP</p>
              </div>

              {user.emergencyContact && (
                <div>
                  <p className="text-xs text-white/40 mb-1">เบอร์ติดต่อฉุกเฉิน</p>
                  <p className="text-sm text-white font-medium">{user.emergencyContact}</p>
                </div>
              )}

              {user.role === "SMOKER" && user.followers && user.followers.length > 0 && (
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-white/40 mb-2">ผู้ติดตาม (Followers)</p>
                  <div className="space-y-2">
                    {user.followers.map((fam: any) => (
                      <div key={fam.id} className="flex items-center justify-between text-sm">
                        <span className="text-white">{fam.displayName}</span>
                        <span className="text-white/50">{fam.phoneNumber}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {user.role === "FAMILY" && user.followedSmokers && user.followedSmokers.length > 0 && (
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-white/40 mb-2">ดูแลผู้สูบ</p>
                  <div className="space-y-2">
                    {user.followedSmokers.map((smoker: any) => (
                      <div key={smoker.id} className="flex items-center justify-between text-sm">
                        <span className="text-white font-medium">{smoker.displayName}</span>
                        <span className="text-white/50">{smoker.phoneNumber}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {user.survey && (
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">แบบสอบถามก่อนใช้งาน</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-white/40">อายุ / เพศ</p>
                  <p className="text-sm text-white">{user.survey.ageGroup} / {user.survey.gender}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">อาชีพ</p>
                  <p className="text-sm text-white">{user.survey.occupation}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">ความถี่ / เวลาที่อยากสูบ</p>
                  <p className="text-sm text-white">{user.survey.frequency} มวน/วัน, ช่วง {user.survey.cravingTime}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">สูบมานาน / ระดับการติด</p>
                  <p className="text-sm text-white">{user.survey.duration} / {user.survey.addictionLevel}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">เหตุผลที่อยากเลิก</p>
                  <p className="text-sm text-white">{user.survey.reasonToQuit}</p>
                </div>
                {user.survey.previousMethods && (
                  <div>
                    <p className="text-xs text-white/40">วิธีที่เคยใช้เลิก</p>
                    <p className="text-sm text-white">{user.survey.previousMethods}</p>
                  </div>
                )}
                {user.survey.desiredHelp && (
                  <div>
                    <p className="text-xs text-white/40">สิ่งที่อยากให้แอปช่วย</p>
                    <p className="text-sm text-white">{user.survey.desiredHelp}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {user.role === "FAMILY" && user.followerSurvey && (
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">แบบสอบถามผู้ติดตาม</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-white/40">ความสัมพันธ์</p>
                  <p className="text-sm text-white">{user.followerSurvey.relation}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">ความถี่ที่เห็นสูบ</p>
                  <p className="text-sm text-white">{user.followerSurvey.smokingFrequency}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">เรื่องที่กังวลที่สุด</p>
                  <p className="text-sm text-white">{user.followerSurvey.concern}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">วิธีสนับสนุนที่เลือก</p>
                  <p className="text-sm text-white">{user.followerSurvey.supportMethod}</p>
                </div>
                {user.followerSurvey.reward && (
                  <div>
                    <p className="text-xs text-white/40">รางวัลถ้าเลิกได้</p>
                    <p className="text-sm text-white">{user.followerSurvey.reward}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <ActivityTimeline activities={user.activities} />
        </div>
      </div>

      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        userId={user.id}
        initialData={{
          displayName: user.displayName,
          phoneNumber: user.phoneNumber,
          xp: user.xp,
        }}
        onSuccess={() => {
          setIsEditModalOpen(false);
          loadData();
        }}
      />
    </div>
  );
}

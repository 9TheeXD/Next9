// ─────────────────────────────────────────────
// auth.js — จัดการ session ผู้ใช้ (localStorage)
// ─────────────────────────────────────────────

const Auth = {
  SESSION_TTL: 24 * 60 * 60 * 1000, // 24 hours

  // บันทึกผู้ใช้ที่เลือก (พร้อม timestamp)
  login(member) {
    const session = { ...member, loginAt: Date.now() };
    localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));
  },

  // ดึงข้อมูลผู้ใช้ปัจจุบัน (ตรวจ expiry)
  getCurrentUser() {
    const raw = localStorage.getItem(CONFIG.SESSION_KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      // ถ้า session หมดอายุ (24 ชม.) ให้ logout
      if (data.loginAt && (Date.now() - data.loginAt) > this.SESSION_TTL) {
        this.logout();
        return null;
      }
      return data;
    }
    catch { return null; }
  },

  // ออกจากระบบ
  logout() {
    localStorage.removeItem(CONFIG.SESSION_KEY);
  },

  // ตรวจว่า login อยู่ไหม — ถ้าไม่ให้ redirect ไปหน้า login
  requireAuth() {
    const user = this.getCurrentUser();
    if (!user) {
      window.location.href = "index.html";
      return null;
    }
    return user;
  },

  // ถ้า login อยู่แล้ว ให้ redirect ไปหน้า dashboard
  redirectIfLoggedIn() {
    const user = this.getCurrentUser();
    if (user) {
      window.location.href = "dashboard.html";
      return true;
    }
    return false;
  },
};

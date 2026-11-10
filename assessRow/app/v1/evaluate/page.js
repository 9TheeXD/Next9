'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Modal from '../../components/Modal';
import { SCORE_LABELS } from '@/lib/scoreUtils';
import Toast from '../../components/Toast';

const CRITERIA = [
  { id: 1, text: 'จัดระเบียบแถวเป็นระเบียบเรียบร้อย' },
  { id: 2, text: 'ไม่พูดคุยขณะทำกิจกรรม' },
  { id: 3, text: 'ร้องเพลงชาติ และเพลงสรรเสริญพระบารมีได้ถูกต้อง เสียงดังชัดเจน โดยพร้อมเพรียงกัน' },
  { id: 4, text: 'ตั้งใจสวดมนต์ไหว้พระ แผ่เมตตา' },
  { id: 5, text: 'การเดินแถวเข้าชั้นเรียนเป็นระเบียบ' },
];

const SCORE_OPTIONS = [
  { value: 0, label: 'ไม่ได้ประเมิน' },
  { value: 1, label: SCORE_LABELS[1] },
  { value: 2, label: SCORE_LABELS[2] },
  { value: 3, label: SCORE_LABELS[3] },
  { value: 4, label: SCORE_LABELS[4] },
  { value: 5, label: SCORE_LABELS[5] },
];

const RUBRIC = [
  { text: 'นักเรียนปฏิบัติมากกว่าร้อยละ 90', score: 5 },
  { text: 'นักเรียนปฏิบัติร้อยละ 70-89', score: 4 },
  { text: 'นักเรียนปฏิบัติร้อยละ 50-69', score: 3 },
  { text: 'นักเรียนปฏิบัติร้อยละ 20-49', score: 2 },
  { text: 'นักเรียนปฏิบัติน้อยกว่าร้อยละ 20', score: 1 },
];

const GRADE_ROOMS = {
  1: [1,2,3,4,5,6,7,8,9,10,11,12,13,14],
  2: [1,2,3,4,5,6,7,8,9,10,11,12,13,14],
  3: [1,2,3,4,5,6,7,8,9,10,11,12,13,14],
  4: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
  5: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
  6: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
};

const ZONE_LABELS = {
  pool: 'ฝั่งสระน้ำ',
  building1: 'ฝั่งอาคาร 1',
};

function formatToday() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const getPart = (type) => parts.find(p => p.type === type).value;
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
}

export default function EvaluatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const [evalModal, setEvalModal] = useState({ open: false, grade: null, zone: null });
  const [scoreModal, setScoreModal] = useState({ open: false, criterion: null, room: null });
  const [hasScrolled, setHasScrolled] = useState(false);
  const [scores, setScores] = useState({});
  const saveStatusRef = useRef({});
  const [saveStatus, setSaveStatus] = useState({});
  const [csrfToken, setCsrfToken] = useState('');
  const [isTimeAllowed, setIsTimeAllowed] = useState(true);
  const [timeAlertModal, setTimeAlertModal] = useState(false);
  const [evalWindow, setEvalWindow] = useState({ from: '07:00', to: '08:30', closedReason: '' });

  // The window admins set on /admin.
  useEffect(() => {
    fetch('/api/settings/eval-time', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => d.from && d.to && setEvalWindow({ from: d.from, to: d.to, closedReason: d.todayStatus && !d.todayStatus.open ? d.todayStatus.reason || 'วันนี้ปิดประเมิน' : '' }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function checkTime() {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(now);
      let hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
      if (hour === 24) hour = 0;
      const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
      
      const timeInMinutes = hour * 60 + minute;
      const startMinutes = parseInt(evalWindow.from.slice(0, 2), 10) * 60 + parseInt(evalWindow.from.slice(3), 10);
      const endMinutes = parseInt(evalWindow.to.slice(0, 2), 10) * 60 + parseInt(evalWindow.to.slice(3), 10);
      
      return !evalWindow.closedReason && timeInMinutes >= startMinutes && timeInMinutes <= endMinutes;
    }

    const allowed = checkTime();
    setIsTimeAllowed(allowed);
    if (!allowed) {
      setTimeout(() => setTimeAlertModal(true), 300);
    }
    
    const interval = setInterval(() => {
      setIsTimeAllowed(checkTime());
    }, 30000);
    return () => clearInterval(interval);
  }, [evalWindow]);

  useEffect(() => {
    if (status !== 'loading' && session?.user?.role === 'student') {
      router.push('/v1?error=unauthorized_eval');
    }
  }, [session, status, router]);

  useEffect(() => {
    async function fetchCsrf() {
      try {
        const res = await fetch('/api/csrf');
        if (res.ok) {
          const data = await res.json();
          setCsrfToken(data.csrfToken);
        }
      } catch (err) {
        console.error('Failed to fetch CSRF token', err);
      }
    }
    fetchCsrf();
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ visible: true, message, type });
  }, []);

  const fetchScores = useCallback(async (grade, zone) => {
    try {
      const today = formatToday();
      // Hardcode zone to 'pool' so both sides share the exact same table data
      let url;
      if (grade === 'overall') {
        url = `/api/evaluations?date=${encodeURIComponent(today)}&zone=pool&room=0&_t=${Date.now()}`;
      } else {
        url = `/api/evaluations?date=${encodeURIComponent(today)}&grade=${grade}&zone=pool&_t=${Date.now()}`;
      }
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        setScores(prev => {
          const next = {};
          data.forEach((row) => {
            if (grade === 'overall') {
              next[`${row.criterion}-${row.grade}`] = row.score;
            } else {
              next[`${row.criterion}-${row.room}`] = row.score;
            }
          });
          // Restore cells that are currently saving to avoid jumpiness
          Object.keys(saveStatusRef.current).forEach(key => {
            if (saveStatusRef.current[key]?.status === 'saving') {
              if (prev[key] !== undefined) {
                next[key] = prev[key];
              }
            }
          });
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to fetch existing scores');
    }
  }, []);

  useEffect(() => {
    // Auto-refresh removed to prevent input interruption
  }, [evalModal.open, evalModal.grade, evalModal.zone, fetchScores]);

  async function openEvalModal(grade, zone) {
    setEvalModal({ open: true, grade, zone });
    setHasScrolled(false);
    fetchScores(grade, zone);
  }

  async function saveScore(criterion, room, score) {
    const { grade, zone } = evalModal;
    const key = `${criterion}-${room}`;
    
    // 1. Close modal instantly
    setScoreModal({ open: false, criterion: null, room: null });
    
    // 2. Set saving status
    const newStatus = { status: 'saving', score };
    saveStatusRef.current = { ...saveStatusRef.current, [key]: newStatus };
    setSaveStatus(prev => ({ ...prev, [key]: newStatus }));
    
    const actualGrade = grade === 'overall' ? room : grade;
    const actualRoom = grade === 'overall' ? 0 : room;

    try {
      const res = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: actualGrade,
          room: actualRoom,
          zone: 'pool', // Hardcode zone to 'pool' so both sides overwrite the exact same table data
          criterion,
          score,
          date: formatToday(),
          csrfToken,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setScores(prev => ({ ...prev, [key]: score }));
        showToast('บันทึกคะแนนสำเร็จ', 'success');
        
        // Update status to success
        const successStatus = { status: 'success', score };
        saveStatusRef.current = { ...saveStatusRef.current, [key]: successStatus };
        setSaveStatus(prev => ({ ...prev, [key]: successStatus }));
        
        // Clear success status after 2 seconds
        setTimeout(() => {
          if (saveStatusRef.current[key]?.status === 'success') {
             saveStatusRef.current = { ...saveStatusRef.current };
             delete saveStatusRef.current[key];
             setSaveStatus(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
             });
          }
        }, 2000);
      } else {
        showToast(data.message || 'บันทึกไม่สำเร็จ', 'error');
        const errStatus = { status: 'error', score };
        saveStatusRef.current = { ...saveStatusRef.current, [key]: errStatus };
        setSaveStatus(prev => ({ ...prev, [key]: errStatus }));
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
      const errStatus = { status: 'error', score };
      saveStatusRef.current = { ...saveStatusRef.current, [key]: errStatus };
      setSaveStatus(prev => ({ ...prev, [key]: errStatus }));
    }
  }

  function getScore(criterion, room) {
    return scores[`${criterion}-${room}`] || 0;
  }

  if (status === 'loading') {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '60px' }}>
        <div className="spinner" style={{ color: '#b91c1c' }}></div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null; // Middleware will handle redirect
  }

  // Main evaluation interface
  const isOverall = evalModal.grade === 'overall';
  const rooms = isOverall ? [1, 2, 3, 4, 5, 6] : (evalModal.grade ? GRADE_ROOMS[evalModal.grade] || [] : []);

  return (
    <div className="container">
      <div className="section-header">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '12px' }}>
          <h1 style={{ margin: 0 }}>หน้าประเมิน</h1>
          <span style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 'normal' }}>
            {(() => {
              const parts = formatToday().split('-');
              return `${parts[2]}/${parts[1]}/${parseInt(parts[0]) + 543}`;
            })()}
          </span>
        </div>
        <div style={{ fontSize: '0.9rem', color: '#b91c1c', fontWeight: 'bold' }}>
          ประเมินในฐานะ: {session?.user?.role === 'council' ? 'สภานักเรียน' : `ครู (${session?.user?.prefix || ''})`}
        </div>
      </div>

      <h3 style={{ marginBottom: '20px', textAlign: 'center', color: '#6b7280' }}>
        เลือกสายชั้นที่ต้องการประเมิน
      </h3>

      <div className="zone-grid" style={{ marginBottom: '16px' }}>
        <button
          className="zone-btn"
          style={{ background: '#b91c1c', color: '#fff', width: '100%', gridColumn: '1 / -1' }}
          onClick={() => openEvalModal('overall', 'pool')}
        >
          ประเมินภาพรวมทุกระดับชั้น
          <ChevronRight size={18} style={{ marginLeft: '4px' }} />
        </button>
      </div>

      <div className="zone-grid">
        {[1, 2, 3, 4, 5, 6].map((grade) => (
          <button
            key={`${grade}-pool`}
            className="zone-btn"
            onClick={() => openEvalModal(grade, 'pool')}
          >
            ม.{grade}
            <ChevronRight size={18} style={{ marginLeft: '4px' }} />
          </button>
        ))}
      </div>

      <Modal
        isOpen={evalModal.open}
        onClose={() => {
          setEvalModal({ open: false, grade: null, zone: null });
          setScores({});
          setSaveStatus({});
          saveStatusRef.current = {};
        }}
        title={isOverall ? 'ประเมินภาพรวมทุกระดับชั้น' : (evalModal.grade ? `ประเมิน ม.${evalModal.grade}` : '')}
      >
        <div style={{ position: 'relative' }}>
          {!hasScrolled && rooms.length > 5 && (
            <div className="scroll-hint">
              <ArrowRight size={24} />
            </div>
          )}
          <div 
            className="table-wrapper"
            onScroll={(e) => {
              if (e.target.scrollLeft > 10 && !hasScrolled) {
                setHasScrolled(true);
              }
            }}
          >
            <table>
            <thead>
              <tr>
                <th>ข้อที่</th>
                <th>รายการประเมิน</th>
                {rooms.map((room) => (
                  <th key={room}>{isOverall ? `ม.${room}` : `${evalModal.grade}/${room}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map((c) => (
                <tr key={c.id}>
                  <td style={{ cursor: 'default' }}>{c.id}</td>
                  <td style={{ cursor: 'default', textAlign: 'left' }}>{c.text}</td>
                  {rooms.map((room) => {
                    const key = `${c.id}-${room}`;
                    const statusObj = saveStatus[key];
                    let displayScore = getScore(c.id, room);
                    let cellStyle = {};
                    let cellClass = `score-cell score-${displayScore}`;
                    
                    if (statusObj) {
                       if (statusObj.status === 'saving') {
                          displayScore = statusObj.score;
                          cellClass = `score-cell score-${displayScore}`;
                          cellStyle.backgroundColor = '#fef08a'; // yellow
                       } else if (statusObj.status === 'success') {
                          cellStyle.backgroundColor = '#bbf7d0'; // green
                       } else if (statusObj.status === 'error') {
                          displayScore = statusObj.score;
                          cellClass = `score-cell score-${displayScore}`;
                          cellStyle.backgroundColor = '#fecaca'; // red
                       }
                    }

                    return (
                      <td
                        key={room}
                        className={cellClass}
                        style={{ cursor: isTimeAllowed ? 'pointer' : 'default', transition: 'background-color 0.3s', opacity: isTimeAllowed ? 1 : 0.8, ...cellStyle }}
                        onClick={() => {
                           if (!isTimeAllowed) {
                             setTimeAlertModal(true);
                             return;
                           }
                           if (statusObj?.status !== 'saving') {
                               setScoreModal({ open: true, criterion: c.id, room });
                           }
                        }}
                      >
                        {displayScore || '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* Rubric */}
        <div className="rubric-table">
          <h4>เกณฑ์การให้คะแนน</h4>
          {RUBRIC.map((r) => (
            <div className="rubric-row" key={r.score}>
              <span>{r.text}</span>
              <span style={{ fontWeight: 600 }}>{r.score}</span>
            </div>
          ))}
        </div>
      </Modal>

      {/* Score Selection Sub-popup */}
      <Modal
        isOpen={scoreModal.open}
        onClose={() => setScoreModal({ open: false, criterion: null, room: null })}
        title={scoreModal.criterion ? `เลือกคะแนน - ข้อ ${scoreModal.criterion} ${isOverall ? `ม.${scoreModal.room}` : `ห้อง ${evalModal.grade}/${scoreModal.room}`}` : ''}
        size="sm"
      >
        <div className="score-picker">
          {SCORE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`score-option ${getScore(scoreModal.criterion, scoreModal.room) === opt.value ? 'selected' : ''}`}
              onClick={() => saveScore(scoreModal.criterion, scoreModal.room, opt.value)}
            >
              <span>{opt.value ? `${opt.value} - ${opt.label}` : `- ${opt.label}`}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        isOpen={timeAlertModal}
        onClose={() => setTimeAlertModal(false)}
        title="หมดเวลาประเมิน"
        size="sm"
      >
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <p style={{ color: '#b91c1c', fontSize: '1.1rem', marginBottom: '10px', fontWeight: 'bold' }}>{evalWindow.closedReason || `เปิดให้ประเมินเวลา ${evalWindow.from} - ${evalWindow.to} น.`}</p>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', lineHeight: '1.5' }}>คุณสามารถดูข้อมูลได้อย่างเดียว<br />ไม่สามารถแก้ไขคะแนนได้ในขณะนี้</p>
          <button className="btn btn-primary" style={{ marginTop: '20px', width: '100%' }} onClick={() => setTimeAlertModal(false)}>
            ตกลง
          </button>
        </div>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </div>
  );
}

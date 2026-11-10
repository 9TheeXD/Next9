import { useState } from 'react';
import Modal from './Modal';
import { FileDown } from 'lucide-react';

export default function ExportWordModal({ isOpen, onClose }) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setError('');
      
      const res = await fetch(`/api/evaluations/summary?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error('ไม่สามารถดึงข้อมูลได้');
      const data = await res.json();
      
      const { generateWordDocumentBlob } = await import('@/lib/exportWord');
      const blob = await generateWordDocumentBlob(startDate, endDate, data);
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `รายงานระเบียบแถว_${startDate}_ถึง_${endDate}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      setError(err.message || 'เกิดข้อผิดพลาดในการสร้างเอกสาร');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); setError(''); }} title="ส่งออกเอกสาร Word">
      <div style={{ padding: '10px' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>วันที่เริ่มต้น:</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>ถึง:</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            />
          </div>
        </div>

        {error && (
          <div style={{ padding: '12px', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '4px', marginBottom: '16px', fontSize: '0.9em' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button 
            className="btn" 
            onClick={() => { onClose(); setError(''); }}
            style={{ backgroundColor: '#f1f5f9', color: '#475569', border: 'none' }}
            disabled={isExporting}
          >
            ยกเลิก
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleExport}
            disabled={isExporting}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px', justifyContent: 'center' }}
          >
            {isExporting ? (
              <><span className="spinner" style={{ color: 'white' }}></span> ส่งออก...</>
            ) : (
              <><FileDown size={18} /> ส่งออก</>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

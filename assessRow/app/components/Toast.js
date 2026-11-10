'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Toast({ message, type = 'info', isVisible, onClose }) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div className={`toast toast-${type}`}>
      <span>{message}</span>
      <button className="toast-close" onClick={onClose} aria-label="ปิด">
        <X size={16} />
      </button>
    </div>
  );
}

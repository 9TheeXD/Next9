'use client';

import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, size }) {
  if (!isOpen) return null;

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <div className={`modal-overlay ${size === 'sm' ? 'modal-sm' : ''}`} onClick={handleOverlayClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="ปิด">
            <X size={22} />
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

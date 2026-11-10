"use client";

import { UPLOAD_SLOT_LABEL, type UploadSlot } from "./useUploads";

// The tile a picked file holds in the grid until the photo itself arrives. It exists from the moment
// the upload starts, at the position the file will have in the newest-first grid (last picked first),
// so the grid never reshuffles as files finish in whatever order the network gives them.
const ICON: Record<UploadSlot["status"], string> = {
  preparing: "fas fa-circle-notch fa-spin",
  pending: "fas fa-clock",
  uploading: "fas fa-arrow-up-from-bracket",
  processing: "fas fa-cog fa-spin",
  done: "fas fa-check",
  failed: "fas fa-triangle-exclamation",
};

export function UploadSlotTile({ slot, onRetry, onDismiss }: { slot: UploadSlot; onRetry?: (key: string) => void; onDismiss?: (key: string) => void }) {
  return (
    <div className={"photos-grid-item upload-slot" + (slot.status === "failed" ? " failed" : "")} data-upload-status={slot.status} title={slot.error || undefined}>
      <div className="upload-slot-body">
        <i className={ICON[slot.status]} />
        <span className="upload-slot-status">{UPLOAD_SLOT_LABEL[slot.status]}</span>
        {slot.status === "uploading" ? (
          <span className="upload-slot-bar">
            <span style={{ width: slot.pct + "%" }} />
          </span>
        ) : null}
        {slot.name ? <span className="upload-slot-name">{slot.name}</span> : null}
        {slot.status === "failed" && slot.error ? <span className="upload-slot-error">{slot.error}</span> : null}
        {slot.status === "failed" && onRetry ? (
          <span className="upload-slot-actions">
            <button type="button" className="upload-slot-retry" onClick={() => onRetry(slot.key)}>
              <i className="fas fa-rotate-right" /> ลองอีกครั้ง
            </button>
            {onDismiss ? (
              <button type="button" className="upload-slot-dismiss" aria-label="เอาออก" onClick={() => onDismiss(slot.key)}>
                <i className="fas fa-xmark" />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

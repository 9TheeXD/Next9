"use client";

import { GlassFilter } from "@/components/ui/liquid-glass";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HAPTIC, haptic } from "@/lib/photos/util";

// The photos pages' own dialogs and toast (the legacy "Custom Modal System" that replaces browser
// dialogs), rendered inside the page wrapper so the page CSS styles them.

export type PromptOptions = {
  title?: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  isPassword?: boolean;
  isDate?: boolean;
};
export type ConfirmOptions = {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  icon?: string;
};
export type ToastType = "success" | "error" | "" | undefined;

export type PhotosUI = {
  prompt: (o: PromptOptions) => Promise<string | null>;
  confirm: (o: ConfirmOptions) => Promise<boolean | null>;
  toast: (message: ReactNode, type?: ToastType, sticky?: boolean) => void;
  hideToast: () => void;
};

const Ctx = createContext<PhotosUI | null>(null);

export function usePhotosUI() {
  const ui = useContext(Ctx);
  if (!ui) throw new Error("usePhotosUI outside PhotosUIProvider");
  return ui;
}

type ModalState =
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void }
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean | null) => void };

// variant: the home page shows a lock icon for password prompts and selects a prefilled value; the
// album page always shows the pen and vibrates on error toasts, as the legacy pages did.
export function PhotosUIProvider({ children, variant }: { children: ReactNode; variant: "home" | "album" }) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const [shown, setShown] = useState(false); // .show class (drives the fade/scale transition)
  const [value, setValue] = useState("");
  const pending = useRef<ModalState | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [toastState, setToastState] = useState<{ msg: ReactNode; type: ToastType; show: boolean; key: number }>({ msg: null, type: "", show: false, key: 0 });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback((m: ModalState) => {
    // A dialog still open resolves as cancelled, as the legacy single overlay did.
    if (pending.current && pending.current !== m) pending.current.resolve(null);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    pending.current = m;
    setValue(m.kind === "prompt" ? m.opts.defaultValue || "" : "");
    setModal(m);
    setShown(false);
    requestAnimationFrame(() => setShown(true));
  }, []);

  const close = useCallback((result?: { value: string | boolean }) => {
    const m = pending.current;
    pending.current = null;
    setShown(false);
    if (m) (m.resolve as (v: unknown) => void)(result ? result.value : null);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    // display:none once the fade has finished, unless another dialog opened meanwhile
    closeTimer.current = setTimeout(() => {
      if (!pending.current) setModal(null);
    }, 200);
  }, []);

  useEffect(() => {
    if (!shown || modal?.kind !== "prompt") return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      if (variant === "home" && modal.opts.defaultValue) inputRef.current?.select();
    }, 50);
    return () => clearTimeout(t);
  }, [shown, modal, variant]);

  const toast = useCallback(
    (msg: ReactNode, type?: ToastType, sticky = false) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToastState((s) => ({ msg, type, show: true, key: s.key + 1 }));
      if (!sticky) toastTimer.current = setTimeout(() => setToastState((s) => ({ ...s, show: false })), 3000);
      if (type === "error" && variant === "album") haptic(HAPTIC.error);
    },
    [variant],
  );
  const hideToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastState((s) => ({ ...s, show: false }));
  }, []);

  const ui = useMemo<PhotosUI>(
    () => ({
      prompt: (opts) => new Promise((resolve) => open({ kind: "prompt", opts, resolve })),
      confirm: (opts) => new Promise((resolve) => open({ kind: "confirm", opts, resolve })),
      toast,
      hideToast,
    }),
    [open, toast, hideToast],
  );

  const m = modal;
  const isPrompt = m?.kind === "prompt";
  const p = (m?.opts || {}) as PromptOptions & ConfirmOptions;
  const iconClass = isPrompt ? "custom-modal-icon info" : "custom-modal-icon " + (p.isDanger ? "danger" : "warning");
  const icon = isPrompt ? (variant === "home" && p.isPassword ? "fas fa-lock" : "fas fa-pen") : p.icon || "fas fa-trash-alt";
  const confirm = () => close({ value: isPrompt ? value : true });

  return (
    <Ctx.Provider value={ui}>
      {/* One per page: every glass pane's distortion layer points at this filter. */}
      <GlassFilter />
      {children}
      <div className={"custom-modal-overlay" + (shown ? " show" : "")} id="customModalOverlay" style={{ display: m ? "flex" : "none" }}>
        <div className="custom-modal-box" id="customModalBox">
          <div className={iconClass} id="cmIcon">
            <i className={icon} />
          </div>
          <h3 id="cmTitle">{p.title || ""}</h3>
          <p id="cmMessage" style={{ display: p.message ? "block" : "none" }}>
            {p.message || ""}
          </p>
          <div id="cmInputContainer" style={{ display: isPrompt ? "block" : "none", margin: "14px 0 6px" }}>
            <input
              ref={inputRef}
              type={p.isPassword ? "password" : p.isDate ? "date" : "text"}
              id="cmInput"
              className="custom-modal-input"
              autoComplete="off"
              placeholder={p.placeholder || ""}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirm();
                else if (e.key === "Escape") close();
              }}
            />
          </div>
          <div className="custom-modal-actions" id="cmActions">
            <button className="btn-modal btn-cancel" id="cmCancelBtn" onClick={() => close()}>
              {p.cancelText || (isPrompt ? "ยกเลิก" : "ย้อนกลับ")}
            </button>
            <button className={"btn-modal btn-confirm" + (!isPrompt && p.isDanger ? " danger" : "")} id="cmConfirmBtn" onClick={confirm}>
              {p.confirmText || (isPrompt ? "ตกลง" : "ยืนยัน")}
            </button>
          </div>
        </div>
      </div>
      <div className={"toilet-toast " + (toastState.type || "") + (toastState.show ? " show" : "")} id="toast">
        {toastState.msg}
      </div>
    </Ctx.Provider>
  );
}

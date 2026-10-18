import React, { useRef, useState } from "react";
import { supabase } from "../services/supabaseClient";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp";

/**
 * Lets an admin attach documents/images to a status update or escalation.
 * Uploads straight to the 'attachments' bucket and reports [{ name, url }] via onChange.
 */
const AdminAttachmentPicker = ({ value = [], onChange, onUploadingChange, label = "Attach documents", hint }) => {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const setBusy = (b) => {
    setUploading(b);
    onUploadingChange?.(b);
  };

  const handleFiles = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (picked.length === 0) return;
    if (value.length + picked.length > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} files.`);
      return;
    }
    const tooBig = picked.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is larger than 10MB.`);
      return;
    }
    setError(null);
    setBusy(true);
    const added = [];
    for (const file of picked) {
      try {
        const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
        const path = `admin/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("attachments").getPublicUrl(path);
        added.push({ name: file.name, url: data.publicUrl });
      } catch (err) {
        console.error("Attachment upload failed:", err);
        setError(`Failed to upload "${file.name}".`);
      }
    }
    setBusy(false);
    if (added.length) onChange([...value, ...added]);
  };

  return (
    <div>
      <label className="form-label fs-13 fw-semibold text-heading mb-1">
        {label} <span className="fw-normal text-theme-muted">(optional)</span>
      </label>
      {hint && <div className="fs-12 text-theme-muted mb-2">{hint}</div>}
      <input ref={inputRef} type="file" className="d-none" multiple accept={ACCEPT} onChange={handleFiles} />
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm rounded-pill px-3"
        disabled={uploading || value.length >= MAX_FILES}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <><span className="spinner-border spinner-border-sm me-2" />Uploading…</>
        ) : (
          <><i className="bi bi-paperclip me-1" />Add files</>
        )}
      </button>
      <span className="fs-12 text-theme-muted ms-2">PDF, Word, Excel, images · max 10MB · up to {MAX_FILES}</span>
      {error && <div className="text-danger fs-12 mt-2">{error}</div>}
      {value.length > 0 && (
        <ul className="list-unstyled mt-2 mb-0">
          {value.map((f, i) => (
            <li key={f.url} className="d-flex align-items-center justify-content-between fs-13 py-1">
              <span className="text-truncate">
                <i className="bi bi-file-earmark me-2" />{f.name}
              </span>
              <button
                type="button"
                className="btn btn-link btn-sm text-danger p-0 text-decoration-none"
                disabled={uploading}
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AdminAttachmentPicker;

import React, { useState } from "react";
import { supabase } from "../services/supabaseClient";

const FileUpload = ({ onUploadComplete, onUploading, maxFiles = 3 }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    
    if (files.length + selectedFiles.length > maxFiles) {
      setError(`You can only upload up to ${maxFiles} files.`);
      return;
    }
    
    setError(null);
    const newFiles = [...files, ...selectedFiles];
    setFiles(newFiles);
    
    // Auto-upload when files are selected
    handleUpload(newFiles);
  };

  const removeFile = (indexToRemove) => {
    const newFiles = files.filter((_, idx) => idx !== indexToRemove);
    setFiles(newFiles);
    // Note: We are not deleting from Supabase here to keep it simple, 
    // but in a production app you'd want to clean up unused files.
  };

  const handleUpload = async (filesToUpload) => {
    if (!filesToUpload || filesToUpload.length === 0) return;
    
    setUploading(true);
    if (onUploading) onUploading(true);
    
    const uploadedUrls = [];
    
    for (const file of filesToUpload) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, file);

        if (uploadError) {
          throw uploadError;
        }

        const { data } = supabase.storage
          .from('attachments')
          .getPublicUrl(filePath);
          
        uploadedUrls.push(data.publicUrl);
      } catch (err) {
        console.error("Error uploading file:", err);
        setError("Failed to upload one or more files.");
      }
    }
    
    setUploading(false);
    if (onUploading) onUploading(false);
    
    if (onUploadComplete && uploadedUrls.length > 0) {
      onUploadComplete(uploadedUrls);
    }
  };

  return (
    <div className="mb-4">
      <label className="form-label fw-semibold" style={{ color: "var(--text-color)" }}>
        Attach Evidence (Optional)
      </label>
      <div 
        className="p-4 border rounded text-center" 
        style={{ 
          borderStyle: "dashed !important", 
          backgroundColor: "#f8f9fa",
          borderColor: "#ced4da"
        }}
      >
        <div className="mb-2" style={{ fontSize: "2rem" }}>☁️</div>
        <p className="text-muted mb-2">Drag & drop files here, or click to browse</p>
        <p className="small text-muted mb-3">Supported formats: JPG, PNG, PDF, MP4 (Max 10MB)</p>
        
        <input 
          type="file" 
          id="fileUpload" 
          className="d-none" 
          multiple 
          accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4"
          onChange={handleFileChange}
          disabled={uploading || files.length >= maxFiles}
        />
        <label htmlFor="fileUpload" className={`btn btn-sm btn-outline-primary ${uploading ? 'disabled' : ''}`}>
          {uploading ? (
            <><span className="spinner-border spinner-border-sm me-2" />Uploading...</>
          ) : "Browse Files"}
        </label>
      </div>
      
      {error && <div className="text-danger small mt-2">{error}</div>}
      
      {files.length > 0 && (
        <div className="mt-3">
          <ul className="list-group">
            {files.map((file, idx) => (
              <li key={idx} className="list-group-item d-flex justify-content-between align-items-center py-2 bg-light">
                <span className="small text-truncate" style={{ maxWidth: "80%" }}>
                  📄 {file.name}
                </span>
                <button 
                  type="button" 
                  className="btn btn-sm btn-link text-danger p-0 text-decoration-none" 
                  onClick={() => removeFile(idx)}
                  disabled={uploading}
                >
                  ❌
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FileUpload;

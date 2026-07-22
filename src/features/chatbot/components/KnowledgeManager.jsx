import React, { useCallback, useEffect, useState } from 'react';
import { deleteKnowledgeDocument, listKnowledgeBases, listKnowledgeDocuments, uploadKnowledgeDocument } from '../services/chatbotService';

function KnowledgeManager({ user, onError }) {
  const [bases, setBases] = useState([]);
  const [baseId, setBaseId] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const loadDocuments = useCallback(async selectedBaseId => {
    setLoading(true);
    try {
      setDocuments(await listKnowledgeDocuments(user, selectedBaseId));
    } catch (error) {
      onError?.(error?.message || 'Không tải được tài liệu.');
    } finally {
      setLoading(false);
    }
  }, [user, onError]);

  useEffect(() => {
    let active = true;
    listKnowledgeBases(user).then(items => {
      if (!active) return;
      setBases(items);
      const preferred = items.find(item => item.code !== 'chat-derived') || items[0];
      const nextBaseId = preferred?.id || '';
      setBaseId(nextBaseId);
      return loadDocuments(nextBaseId);
    }).catch(error => {
      if (active) onError?.(error?.message || 'Không tải được kho tri thức.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [user, onError, loadDocuments]);

  const handleBaseChange = event => {
    const nextBaseId = event.target.value;
    setBaseId(nextBaseId);
    loadDocuments(nextBaseId);
  };

  const handleUpload = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !baseId) return;
    setUploading(true);
    try {
      await uploadKnowledgeDocument(user, baseId, file);
      await loadDocuments(baseId);
    } catch (error) {
      onError?.(error?.message || 'Không tải được tài liệu.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async document => {
    if (!window.confirm(`Xóa tài liệu "${document.title}" khỏi kho tri thức?`)) return;
    setDeletingId(document.id);
    try {
      await deleteKnowledgeDocument(user, document.id);
      await loadDocuments(baseId);
    } catch (error) {
      onError?.(error?.message || 'Không xóa được tài liệu.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="knowledge-manager">
      <div className="knowledge-toolbar">
        <label>
          <span>Kho tri thức</span>
          <select value={baseId} onChange={handleBaseChange} disabled={loading || bases.length === 0}>
            {bases.map(base => <option key={base.id} value={base.id}>{base.name}</option>)}
          </select>
        </label>
        <label className={`knowledge-upload ${uploading || !baseId ? 'disabled' : ''}`}>
          <i className={`fa-solid ${uploading ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`}></i>
          <span>{uploading ? 'Đang tải...' : 'Thêm tài liệu'}</span>
          <input type="file" accept=".pdf,.docx,.xls,.xlsx,.txt,.md,.markdown,.csv,.json" onChange={handleUpload} disabled={uploading || !baseId} />
        </label>
      </div>

      <p className="workspace-hint">Chatbot tự học tin nhắn và file chat theo quyền thành viên. Tài liệu tải ở đây áp dụng theo phạm vi của kho đã chọn.</p>
      {loading ? (
        <div className="workspace-empty"><i className="fa-solid fa-spinner fa-spin"></i><span>Đang tải tài liệu...</span></div>
      ) : documents.length === 0 ? (
        <div className="workspace-empty"><i className="fa-regular fa-file-lines"></i><span>Kho này chưa có tài liệu.</span></div>
      ) : (
        <div className="workspace-list knowledge-list">
          {documents.map(document => (
            <div className="workspace-list-item knowledge-item" key={document.id}>
              <span className="workspace-file-icon"><i className="fa-solid fa-file-shield"></i></span>
              <span className="workspace-list-copy">
                <strong>{document.title}</strong>
                <small>{document.source_type || 'TEXT'}{document.file_name ? ` · ${document.file_name}` : ''}</small>
              </span>
              <button type="button" className="knowledge-delete" onClick={() => handleDelete(document)} disabled={deletingId === document.id} title="Xóa tài liệu">
                <i className={`fa-solid ${deletingId === document.id ? 'fa-spinner fa-spin' : 'fa-trash-can'}`}></i>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default KnowledgeManager;

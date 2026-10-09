import React, { useState, useEffect, useRef, useMemo } from 'react';
import { chatManagementService } from '../services/chatManagementService';

const WORKFLOW_STAGES = [
  { id: 'new', label: 'Chưa xử lý', color: '#f59e0b', icon: 'fa-clock' },
  { id: 'in_progress', label: 'Đang xử lý', color: '#3b82f6', icon: 'fa-spinner' },
  { id: 'pending', label: 'Đang đợi phản hồi', color: '#8b5cf6', icon: 'fa-hourglass-half' },
  { id: 'completed', label: 'Hoàn thành', color: '#10b981', icon: 'fa-circle-check' },
];

export default function ZaloCrmHeaderControls({
  conversation,
  accounts = [],
  onConversationUpdated,
  copy,
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [localAccounts, setLocalAccounts] = useState(accounts);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assignedAgentId, setAssignedAgentId] = useState(conversation?.assigned_agent_id || null);
  const [assignedAgentName, setAssignedAgentName] = useState(conversation?.assigned_agent_name || '');
  const [workflowStage, setWorkflowStage] = useState(conversation?.workflow_stage || 'new');

  const assignRef = useRef(null);
  const workflowRef = useRef(null);

  // Sync state if conversation changes
  useEffect(() => {
    setAssignedAgentId(conversation?.assigned_agent_id || null);
    setAssignedAgentName(conversation?.assigned_agent_name || '');
    setWorkflowStage(conversation?.workflow_stage || 'new');
  }, [conversation?.id, conversation?.assigned_agent_id, conversation?.assigned_agent_name, conversation?.workflow_stage]);

  // Load employee directory if accounts is empty
  useEffect(() => {
    if (assignOpen && (!localAccounts || localAccounts.length === 0)) {
      setLoadingUsers(true);
      chatManagementService.listUsers()
        .then(res => {
          if (Array.isArray(res)) setLocalAccounts(res);
        })
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
  }, [assignOpen, localAccounts]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = event => {
      if (assignRef.current && !assignRef.current.contains(event.target)) {
        setAssignOpen(false);
      }
      if (workflowRef.current && !workflowRef.current.contains(event.target)) {
        setWorkflowOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredAccounts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const list = Array.isArray(localAccounts) && localAccounts.length > 0 ? localAccounts : accounts;
    if (!query) return list;
    return list.filter(u =>
      (u.name || u.displayName || u.username || '').toLowerCase().includes(query)
    );
  }, [searchTerm, localAccounts, accounts]);

  const currentStage = useMemo(() => {
    return WORKFLOW_STAGES.find(s => s.id === workflowStage) || WORKFLOW_STAGES[0];
  }, [workflowStage]);

  const handleSelectAgent = async (agent) => {
    const nextId = agent ? (agent.id || agent.uid) : null;
    const nextName = agent ? (agent.name || agent.displayName || agent.username) : '';

    setAssignedAgentId(nextId);
    setAssignedAgentName(nextName);
    setAssignOpen(false);

    try {
      await chatManagementService.assignZaloAgent({
        conversationId: conversation.id,
        agentId: nextId,
        agentName: nextName,
      });
      if (onConversationUpdated) {
        onConversationUpdated({
          ...conversation,
          assigned_agent_id: nextId,
          assigned_agent_name: nextName,
        });
      }
    } catch (err) {
      console.warn('Failed to assign agent:', err);
    }
  };

  const handleSelectWorkflow = async (stage) => {
    setWorkflowStage(stage.id);
    setWorkflowOpen(false);

    try {
      await chatManagementService.updateZaloWorkflow({
        conversationId: conversation.id,
        workflowStage: stage.id,
        tags: conversation.tags || [],
      });
      if (onConversationUpdated) {
        onConversationUpdated({
          ...conversation,
          workflow_stage: stage.id,
          status: stage.id === 'completed' ? 'bot_resolved' : 'agent_handling',
          needs_human: stage.id !== 'completed',
        });
      }
    } catch (err) {
      console.warn('Failed to update workflow stage:', err);
    }
  };

  const oaName = conversation?.oa_name || 'Zalo OA';

  return (
    <div className="zalo-crm-header-controls">
      {/* Kênh & Tên Bot Tag */}
      <span className="zalo-crm-tag-badge">
        <i className="fa-solid fa-comment-dots"></i>
        <span>Zalo OA</span>
        {oaName && <strong className="zalo-crm-bot-name">· {oaName}</strong>}
      </span>

      {/* Dropdown 1: Chỉ định nhân viên xử lý */}
      <div className="zalo-crm-dropdown-wrap" ref={assignRef}>
        <button
          type="button"
          className={`zalo-crm-btn ${assignedAgentName ? 'has-assigned' : ''}`}
          onClick={() => { setAssignOpen(!assignOpen); setWorkflowOpen(false); }}
          title="Chỉ định nhân viên xử lý"
        >
          {assignedAgentName ? (
            <>
              <i className="fa-solid fa-user-check text-blue"></i>
              <span className="zalo-crm-agent-name">{assignedAgentName}</span>
            </>
          ) : (
            <>
              <span>Chỉ định nhân viên xử lý</span>
            </>
          )}
          <i className="fa-solid fa-chevron-down zalo-crm-chevron"></i>
        </button>

        {assignOpen && (
          <div className="zalo-crm-popover">
            <div className="zalo-crm-search-box">
              <i className="fa-solid fa-magnifying-glass"></i>
              <input
                type="text"
                placeholder="Tìm kiếm nhân viên..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>

            <div className="zalo-crm-list">
              {assignedAgentId && (
                <div
                  className="zalo-crm-user-item unassign"
                  onClick={() => handleSelectAgent(null)}
                >
                  <span className="zalo-crm-avatar-placeholder">
                    <i className="fa-solid fa-user-xmark"></i>
                  </span>
                  <span>Bỏ chỉ định nhân viên</span>
                </div>
              )}

              {loadingUsers ? (
                <div className="zalo-crm-empty">Đang tải nhân viên...</div>
              ) : filteredAccounts.length === 0 ? (
                <div className="zalo-crm-empty">Không tìm thấy nhân viên</div>
              ) : (
                filteredAccounts.map(account => {
                  const accId = account.id || account.uid;
                  const accName = account.name || account.displayName || account.username || 'Nhân viên';
                  const accAvatar = account.avatar || account.avatarUrl;
                  const isSelected = assignedAgentId === accId;

                  return (
                    <div
                      key={accId}
                      className={`zalo-crm-user-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectAgent(account)}
                    >
                      {accAvatar ? (
                        <img src={accAvatar} alt={accName} className="zalo-crm-avatar" />
                      ) : (
                        <span className="zalo-crm-avatar-placeholder">
                          {accName.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="zalo-crm-user-name">{accName}</span>
                      {isSelected && <i className="fa-solid fa-check zalo-crm-check"></i>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dropdown 2: Gắn nhãn quy trình */}
      <div className="zalo-crm-dropdown-wrap" ref={workflowRef}>
        <button
          type="button"
          className="zalo-crm-btn"
          style={{ borderColor: currentStage.color }}
          onClick={() => { setWorkflowOpen(!workflowOpen); setAssignOpen(false); }}
          title="Gắn nhãn quy trình"
        >
          <span
            className="zalo-crm-stage-dot"
            style={{ backgroundColor: currentStage.color }}
          ></span>
          <span>{currentStage.label}</span>
          <i className="fa-solid fa-chevron-down zalo-crm-chevron"></i>
        </button>

        {workflowOpen && (
          <div className="zalo-crm-popover workflow-popover">
            <div className="zalo-crm-popover-title">Gắn nhãn quy trình</div>
            <div className="zalo-crm-list">
              {WORKFLOW_STAGES.map(stage => {
                const isSelected = workflowStage === stage.id;
                return (
                  <div
                    key={stage.id}
                    className={`zalo-crm-stage-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectWorkflow(stage)}
                  >
                    <span
                      className="zalo-crm-stage-dot"
                      style={{ backgroundColor: stage.color }}
                    ></span>
                    <span className="zalo-crm-stage-label">{stage.label}</span>
                    {isSelected && <i className="fa-solid fa-check zalo-crm-check"></i>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

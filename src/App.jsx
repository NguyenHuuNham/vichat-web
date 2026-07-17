import React, { useState, useEffect, useRef } from 'react';
import Login from './components/Login';

// --- Initial Conversions Data ---
const INITIAL_CHAT_DATA = {
  "dieu-hanh": {
    id: "dieu-hanh",
    name: "Điều hành",
    isGroup: true,
    avatarHtml: <i className="fa-solid fa-users"></i>,
    avatarClass: "group",
    membersCount: "6 thành viên",
    description: "Nhóm trao đổi công việc chung phòng Điều hành",
    admin: "Nguyễn Văn Tuấn",
    members: [
      { name: "Nguyễn Văn Tuấn", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80", online: true },
      { name: "Nguyễn Thị Lan", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80", online: true },
      { name: "Trần Văn Hùng", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&h=100&q=80", online: false },
      { name: "Phạm Thị Hương", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&h=100&q=80", online: true },
      { name: "Lê Quốc Bảo", avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=100&h=100&q=80", online: false },
      { name: "Đỗ Minh Quân", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&h=100&q=80", online: true }
    ],
    messages: [
      { id: "m1", type: "text", sender: "incoming", senderName: "Nguyễn Văn Tuấn", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80", text: "Anh gửi giúp em hợp đồng nhé.", time: "09:20" },
      { id: "m2", type: "text", sender: "outgoing", text: "Đây nhé, em xem giúp anh.", time: "09:21" },
      { id: "m3", type: "file", sender: "outgoing", file: { name: "HopDong.pdf", ext: "pdf", size: "PDF • 2.45 MB" }, time: "09:21" },
      { id: "m4", type: "text", sender: "incoming", senderName: "Nguyễn Thị Lan", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80", text: "Đã nhận được anh, cảm ơn anh.", time: "09:22" },
      { id: "m5", type: "image", sender: "incoming", senderName: "Nguyễn Thị Lan", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80", image: "/songhong_petro.png", time: "09:24" },
      { id: "m6", type: "file", sender: "outgoing", file: { name: "BaoGia.xlsx", ext: "excel", size: "XLSX • 128 KB" }, time: "09:25" }
    ],
    lastMsg: "Bạn: BaoGia.xlsx",
    time: "09:30",
    badge: 2
  },
  "nguyen-van-tuan": {
    id: "nguyen-van-tuan",
    name: "Nguyễn Văn Tuấn",
    isGroup: false,
    avatarHtml: <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80" alt="Tuấn" />,
    membersCount: "Trưởng phòng Điều hành",
    description: "Hội thoại cá nhân với Nguyễn Văn Tuấn.",
    admin: "",
    members: [
      { name: "Nguyễn Văn Tuấn", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80", online: true }
    ],
    messages: [
      { id: "t1", type: "text", sender: "incoming", senderName: "Nguyễn Văn Tuấn", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80", text: "Chào anh Lâm, file báo giá em gửi trong nhóm điều hành anh xem chưa ạ?", time: "09:15" },
      { id: "t2", type: "text", sender: "outgoing", text: "Anh đang xem rồi Tuấn nhé. Bản báo giá chi tiết và đầy đủ lắm.", time: "09:18" },
      { id: "t3", type: "text", sender: "incoming", senderName: "Nguyễn Văn Tuấn", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80", text: "Dạ vâng, có gì anh phê duyệt sớm giúp em để gửi cho khách hàng trong hôm nay ạ.", time: "09:20" }
    ],
    lastMsg: "Bạn: BaoGia.xlsx",
    time: "09:25",
    badge: 1
  },
  "hcns": {
    id: "hcns",
    name: "HCNS",
    isGroup: true,
    avatarHtml: <span>H</span>,
    avatarClass: "group purple",
    membersCount: "8 thành viên",
    description: "Phòng Hành chính Nhân sự - Thông tin và thông báo nội bộ",
    admin: "Phạm Thị Hương",
    members: [
      { name: "Phạm Thị Hương", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&h=100&q=80", online: true },
      { name: "Mai Thành Lâm", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&h=100&q=80", online: true },
      { name: "Nguyễn Thị Lan", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80", online: true }
    ],
    messages: [
      { id: "h1", type: "text", sender: "incoming", senderName: "Phạm Thị Hương", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&h=100&q=80", text: "Thông báo lịch nghỉ lễ chính thức đã được gửi vào email của mọi người rồi nhé. Ai có thắc mắc gì phản hồi lại giúp em.", time: "14:30" },
      { id: "h2", type: "text", sender: "incoming", senderName: "Nguyễn Thị Lan", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80", text: "Cảm ơn phòng HCNS nhiều nhé.", time: "14:35" },
      { id: "h3", type: "text", sender: "outgoing", text: "Đã nhận thông tin.", time: "15:00" }
    ],
    lastMsg: "Mai nghỉ 1 ngày để tham gia...",
    time: "09:18"
  },
  "ke-toan": {
    id: "ke-toan",
    name: "Kế toán",
    isGroup: true,
    avatarHtml: <span>K</span>,
    avatarClass: "group orange",
    membersCount: "4 thành viên",
    description: "Phòng Kế toán tài chính doanh nghiệp",
    admin: "Lê Quốc Bảo",
    members: [
      { name: "Lê Quốc Bảo", avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=100&h=100&q=80", online: false },
      { name: "Mai Thành Lâm", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&h=100&q=80", online: true }
    ],
    messages: [
      { id: "k1", type: "text", sender: "incoming", senderName: "Lê Quốc Bảo", avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=100&h=100&q=80", text: "Anh Lâm xem giúp em báo cáo chi phí tháng trước em gửi trên hệ thống quản lý nhé sếp.", time: "10:15" },
      { id: "k2", type: "text", sender: "outgoing", text: "Ok Bảo, chiều nay họp xong anh duyệt.", time: "10:30" }
    ],
    lastMsg: "Lan: Đã gửi báo cáo tháng 5",
    time: "08:50"
  },
  "it-support": {
    id: "it-support",
    name: "IT Support",
    isGroup: false,
    avatarHtml: <span>IT</span>,
    avatarClass: "group green",
    membersCount: "Hỗ trợ kỹ thuật",
    description: "Kênh hỗ trợ kỹ thuật số và bảo trì hạ tầng mạng nội bộ.",
    admin: "",
    members: [
      { name: "IT Administrator", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80", online: true }
    ],
    messages: [
      { id: "i1", type: "text", sender: "incoming", senderName: "IT Administrator", avatarClass: "group green", text: "Hệ thống máy chủ đã được sao lưu tự động lúc 02:00 AM hôm nay. Trạng thái ổn định.", time: "02:05" }
    ],
    lastMsg: "Server backup lúc 02:00 AM",
    time: "08:30"
  },
  "nguyen-thi-lan": {
    id: "nguyen-thi-lan",
    name: "Nguyễn Thị Lan",
    isGroup: false,
    avatarHtml: '<img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80" alt="Lan" />',
    avatarClass: "",
    membersCount: "Phó phòng Điều hành",
    description: "Hội thoại cá nhân với Nguyễn Thị Lan.",
    admin: "",
    members: [
      { name: "Nguyễn Thị Lan", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80", online: true }
    ],
    messages: [
      { id: "l1", type: "text", sender: "incoming", senderName: "Nguyễn Thị Lan", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80", text: "Anh Lâm ơi, tài liệu họp chiều nay em để trên bàn làm việc của anh rồi nhé.", time: "11:05" },
      { id: "l2", type: "text", sender: "outgoing", text: "Cảm ơn Lan nhé. Anh vừa về văn phòng và thấy rồi.", time: "11:15" }
    ],
    lastMsg: "Bạn: Cảm ơn chị",
    time: "Hôm qua"
  },
  "giam-doc": {
    id: "giam-doc",
    name: "Giám đốc",
    isGroup: false,
    avatarHtml: '<img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&h=100&q=80" alt="Giám đốc" />',
    avatarClass: "",
    membersCount: "Giám đốc điều hành",
    description: "Hội thoại cá nhân trực tiếp với Giám đốc.",
    admin: "",
    members: [
      { name: "Giám đốc", avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&h=100&q=80", online: true }
    ],
    messages: [
      { id: "g1", type: "text", sender: "incoming", senderName: "Giám đốc", avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&h=100&q=80", text: "Lâm báo cáo tiến độ dự án Sông Hồng cho tôi trước 3h chiều nay.", time: "13:10" },
      { id: "g2", type: "text", sender: "outgoing", text: "Dạ vâng, em đang hoàn thiện slide báo cáo gửi sếp duyệt ạ.", time: "13:25" }
    ],
    lastMsg: "Đã nhận báo cáo",
    time: "Hôm qua"
  },
  "phong-kinh-doanh": {
    id: "phong-kinh-doanh",
    name: "Phòng Kinh doanh",
    isGroup: true,
    avatarHtml: <span>KD</span>,
    avatarClass: "group blue",
    membersCount: "12 thành viên",
    description: "Phòng Kinh doanh & Phát triển thị trường",
    admin: "Đỗ Minh Quân",
    members: [
      { name: "Đỗ Minh Quân", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&h=100&q=80", online: true },
      { name: "Nguyễn Văn Tuấn", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80", online: true },
      { name: "Trần Văn Hùng", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&h=100&q=80", online: false }
    ],
    messages: [
      { id: "p1", type: "text", sender: "incoming", senderName: "Đỗ Minh Quân", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&h=100&q=80", text: "Doanh số tuần này vượt chỉ tiêu 15% rồi cả nhà ơi! Làm tốt lắm.", time: "17:00" },
      { id: "p2", type: "text", sender: "incoming", senderName: "Nguyễn Văn Tuấn", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80", text: "Tuyệt vời quá chúc mừng phòng KD nhé.", time: "17:05" },
      { id: "p3", type: "text", sender: "outgoing", text: "Làm tốt lắm mọi người. Tiếp tục phát huy nhé.", time: "17:20" }
    ],
    lastMsg: "Quý 2 kế hoạch như file đính kèm",
    time: "Thứ 6"
  }
};

function App() {
  const [currentChatId, setCurrentChatId] = useState("dieu-hanh");
  const [conversations, setConversations] = useState(INITIAL_CHAT_DATA);
  const [isDetailOpen, setIsDetailOpen] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [inputText, setInputText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Trạng thái xác thực (Auth State)
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // Mobile navigation state
  const [isMobileChatActive, setIsMobileChatActive] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // References
  const chatMessagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeChat = conversations[currentChatId];

  // Auto scroll to bottom of chat
  const scrollToBottom = () => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversations, currentChatId, isTyping]);

  // --- Attach & Gửi tệp tin ---
  const handleAttachClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const fileSize = file.size;
    
    // Định dạng kích thước tệp
    let sizeStr = "";
    if (fileSize > 1024 * 1024) {
      sizeStr = (fileSize / (1024 * 1024)).toFixed(2) + " MB";
    } else {
      sizeStr = (fileSize / 1024).toFixed(1) + " KB";
    }

    // Phân loại mở rộng file
    const extension = fileName.split('.').pop().toLowerCase();
    let extType = "file";
    let displayExt = extension.toUpperCase();
    if (extension === "pdf") {
      extType = "pdf";
    } else if (["xlsx", "xls", "csv"].includes(extension)) {
      extType = "excel";
    }

    const timeStr = getTimeString();
    const newMsg = {
      id: `me-file-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: "file",
      sender: "outgoing",
      file: {
        name: fileName,
        ext: extType,
        size: `${displayExt} • ${sizeStr}`
      },
      time: timeStr
    };

    // 1. Thêm vào conversations state
    setConversations(prev => {
      const room = prev[currentChatId];
      return {
        ...prev,
        [currentChatId]: {
          ...room,
          messages: [...room.messages, newMsg],
          lastMsg: `Bạn: <đính kèm ${fileName}>`
        }
      };
    });

    // Reset file input
    e.target.value = "";

    // 2. Phản hồi giả lập từ thành viên nhóm hoặc cá nhân
    if (currentChatId === "dieu-hanh") {
      setTimeout(() => {
        const responses = [
          { name: "Nguyễn Văn Tuấn", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80", text: `Đã nhận được file ${fileName} sếp nhé. Em đang kiểm tra lại số liệu.` },
          { name: "Nguyễn Thị Lan", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80", text: `Dạ em đã tải file ${fileName} về xem rồi ạ, cảm ơn sếp.` }
        ];
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        appendMockIncomingMessage(currentChatId, randomResponse.name, randomResponse.avatar, randomResponse.text);
      }, 1500);
    } else {
      setTimeout(() => {
        const data = conversations[currentChatId];
        if (data && data.members.length > 0) {
          const respondent = data.members[0];
          appendMockIncomingMessage(currentChatId, respondent.name, respondent.avatar, `Dạ vâng anh Lâm, em đã nhận được tệp "${fileName}" anh gửi rồi nhé!`);
        }
      }, 1500);
    }
  };


  const getTimeString = () => {
    const d = new Date();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // --- Send Message Action ---
  const handleSendMessage = (textToSend = null) => {
    const text = textToSend !== null ? textToSend : inputText.trim();
    if (!text) return;

    const timeStr = getTimeString();
    const newMsg = {
      id: `me-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: "text",
      sender: "outgoing",
      text: text,
      time: timeStr
    };

    // 1. Cập nhật state tin nhắn gửi đi
    setConversations(prev => {
      const room = prev[currentChatId];
      return {
        ...prev,
        [currentChatId]: {
          ...room,
          messages: [...room.messages, newMsg],
          lastMsg: `Bạn: ${text}`
        }
      };
    });

    if (textToSend === null) {
      setInputText("");
    }

    // 2. Phản hồi giả lập từ thành viên nhóm hoặc cá nhân
    if (currentChatId === "dieu-hanh") {
      // Giả lập nhóm Điều hành phản hồi
      setTimeout(() => {
        const responses = [
          { name: "Nguyễn Văn Tuấn", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80", text: "Nhất trí anh Lâm nhé, em sẽ thúc giục các bên." },
          { name: "Nguyễn Thị Lan", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80", text: "Dạ vâng anh, em đã chuẩn bị xong các tài liệu cần thiết." },
          { name: "Phạm Thị Hương", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&h=100&q=80", text: "Vấn đề này phòng HCNS sẽ làm thông báo gửi mọi người sớm." }
        ];
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        appendMockIncomingMessage(currentChatId, randomResponse.name, randomResponse.avatar, randomResponse.text);
      }, 1500);
    } else {
      // Các cuộc trò chuyện cá nhân khác phản hồi
      setTimeout(() => {
        const data = conversations[currentChatId];
        if (data && data.members.length > 0) {
          const respondent = data.members[0];
          appendMockIncomingMessage(currentChatId, respondent.name, respondent.avatar, `Dạ vâng anh Lâm, em đã nhận thông tin: "${text}".`);
        }
      }, 1500);
    }
  };

  const appendMockIncomingMessage = (roomId, senderName, avatarUrl, text) => {
    const timeStr = getTimeString();
    const newMsg = {
      id: `incoming-${Date.now()}`,
      type: "text",
      sender: "incoming",
      senderName: senderName,
      avatar: avatarUrl,
      text: text,
      time: timeStr
    };

    setConversations(prev => {
      const room = prev[roomId];
      return {
        ...prev,
        [roomId]: {
          ...room,
          messages: [...room.messages, newMsg],
          lastMsg: text
        }
      };
    });
  };

  // Helper render text with simple bold/italic markdown
  const renderMessageText = (text) => {
    if (!text) return "";
    // simple parse bold: **text**
    let parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      // parse line breaks
      let subparts = part.split('\n');
      return subparts.map((sub, sidx) => (
        <span key={`${idx}-${sidx}`}>
          {sub}
          {sidx < subparts.length - 1 && <br />}
        </span>
      ));
    });
  };

  // Filter conversations
  const filteredChatIds = Object.keys(conversations).filter(id => {
    const room = conversations[id];
    return room.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (!isLoggedIn) {
    return <Login onLoginSuccess={(user) => { setCurrentUser(user); setIsLoggedIn(true); }} />;
  }

  return (
    <div className={`app-layout ${isMobileChatActive ? 'mobile-active-chat' : ''}`}>

      {/* ==========================================================================
         CỘT 1: SIDEBAR PRIMARY (Màu xanh dương đậm)
         ========================================================================== */}
      <aside className={`sidebar-primary ${isMobileSidebarOpen ? 'open' : ''}`}>
        <div className="brand-container">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" className="logo-icon">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5-10-5-10 5z" />
            </svg>
          </div>
          <h1 className="brand-name">VICHAT</h1>
        </div>

        <nav className="primary-nav">
          <a href="#" className="nav-item active" onClick={(e) => e.preventDefault()}>
            <i className="fa-solid fa-comment-dots"></i>
            <span>Chat</span>
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); alert("Chức năng [Danh bạ] yêu cầu môi trường Enterprise."); }}>
            <i className="fa-solid fa-address-book"></i>
            <span>Danh bạ</span>
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); alert("Chức năng [Nhóm] yêu cầu môi trường Enterprise."); }}>
            <i className="fa-solid fa-users"></i>
            <span>Nhóm</span>
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); alert("Chức năng [File dùng chung] yêu cầu môi trường Enterprise."); }}>
            <i className="fa-solid fa-folder-open"></i>
            <span>File dùng chung</span>
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); alert("Chức năng [Thông báo] yêu cầu môi trường Enterprise."); }}>
            <div className="icon-badge-wrapper">
              <i className="fa-solid fa-bell"></i>
              <span className="badge-count">3</span>
            </div>
            <span>Thông báo</span>
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); alert("Chức năng [Cài đặt] yêu cầu môi trường Enterprise."); }}>
            <i className="fa-solid fa-gear"></i>
            <span>Cài đặt</span>
          </a>
        </nav>

        <div className="primary-footer">
          <div className="user-profile">
            <img src={currentUser?.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&h=100&q=80"} alt="Avatar" className="user-avatar-img" />
            <div className="user-info">
              <span className="user-name">{currentUser?.name || "Mai Thành Lâm"}</span>
              <span className="user-status online">Online</span>
            </div>
          </div>
          <button className="btn-logout-footer" onClick={() => {
            if (window.confirm("Bạn có chắc chắn muốn đăng xuất khỏi VICHAT?")) {
              setIsLoggedIn(false);
              setCurrentUser(null);
            }
          }} title="Đăng xuất">
            <i className="fa-solid fa-arrow-right-from-bracket"></i>
          </button>
        </div>
      </aside>

      {/* ==========================================================================
         CỘT 2: SIDEBAR SECONDARY (Danh sách chat)
         ========================================================================== */}
      <aside className="sidebar-secondary">
        <div className="sidebar-header">
          <div className="header-top">
            <h2>Cuộc trò chuyện</h2>
            <button className="btn-action" title="Tạo cuộc trò chuyện mới" onClick={() => {
              alert("Tính năng tạo cuộc trò chuyện mới đang được liên kết danh bạ doanh nghiệp.");
            }}>
              <i className="fa-solid fa-plus"></i>
            </button>
          </div>
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass search-icon"></i>
            <input
              type="text"
              placeholder="Tìm kiếm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="conversations-list">
          {filteredChatIds.map(id => {
            const room = conversations[id];
            const isActive = currentChatId === id;
            return (
              <div
                key={id}
                className={`conversation-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setCurrentChatId(id);
                  setIsMobileChatActive(true);
                }}
              >
                <div className={`conv-avatar ${room.avatarClass || ''}`}>
                  {room.avatarHtml}
                </div>
                <div className="conv-details">
                  <div class="conv-header">
                    <span className="conv-name">{room.name}</span>
                    <span className="conv-time">{room.time}</span>
                  </div>
                  <div className="conv-message">
                    <span className="conv-last-msg">{room.lastMsg}</span>
                    {room.badge > 0 && <span className="conv-badge">{room.badge}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ==========================================================================
         CỘT 3: CHAT MAIN AREA (Khung chat chính)
         ========================================================================== */}
      <section className="chat-main">
        {/* Header khung chat */}
        <div className="chat-main-header">
          <div className="chat-header-info">
            <button className="btn-back-mobile" onClick={() => setIsMobileChatActive(false)}>
              <i className="fa-solid fa-arrow-left"></i>
            </button>
            <div className={`chat-header-avatar ${activeChat.avatarClass || ''}`}>
              {activeChat.avatarHtml}
            </div>
            <div className="chat-header-meta">
              <h2 className="chat-header-name">{activeChat.name}</h2>
              <span className="chat-header-status">{activeChat.membersCount}</span>
            </div>
          </div>
          <div className="chat-header-actions">
            <button className="btn-header-action" title="Tìm kiếm" onClick={() => alert("Tính năng tìm kiếm đang được phát triển.")}>
              <i className="fa-solid fa-magnifying-glass"></i>
            </button>
            <button className="btn-header-action" title="Gọi điện" onClick={() => alert("Đang kết nối thiết bị gọi thoại...")}>
              <i className="fa-solid fa-phone"></i>
            </button>
            <button className="btn-header-action" title="Gọi video" onClick={() => alert("Đang kết nối camera gọi thoại...")}>
              <i className="fa-solid fa-video"></i>
            </button>
            <button className="btn-header-action" title="Thông tin nhóm" onClick={() => setIsDetailOpen(!isDetailOpen)}>
              <i className="fa-solid fa-ellipsis-vertical"></i>
            </button>
          </div>
        </div>

        {/* Khu vực hiển thị tin nhắn */}
        <div className="chat-messages">
          {currentChatId === "dieu-hanh" ? (
            <div className="date-divider"><span>Hôm nay, 11/07/2026</span></div>
          ) : (
            <div className="date-divider"><span>Hội thoại trực tuyến</span></div>
          )}

          {activeChat.messages.map((msg) => {
            const isOutgoing = msg.sender === "outgoing";
            return (
              <div key={msg.id} className={`message-item ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                {!isOutgoing && (
                  <div className="message-avatar">
                    {msg.avatar ? (
                      <img src={msg.avatar} alt={msg.senderName} />
                    ) : (
                      <div className="conv-avatar group blue" style={{ width: '32px', height: '32px', fontSize: '11px', color: 'white', backgroundColor: 'var(--vichat-blue)' }}>
                        <i className={`fa-solid ${msg.avatarIcon || 'fa-users'}`}></i>
                      </div>
                    )}
                  </div>
                )}

                <div className="message-content-wrapper">
                  {!isOutgoing && msg.senderName && <span className="sender-name">{msg.senderName}</span>}

                  <div className="message-bubble-group">
                    {/* Tin nhắn chữ thường */}
                    {msg.type === "text" && msg.text && (
                      <div className="message-bubble">
                        <p>{renderMessageText(msg.text)}</p>
                        <span className="message-time">
                          {msg.time} {isOutgoing && <i className="fa-solid fa-check-double read-status"></i>}
                        </span>
                      </div>
                    )}

                    {/* Tin nhắn file đính kèm */}
                    {msg.type === "file" && msg.file && (
                      <div className={`message-bubble file-bubble ${msg.file.ext}`}>
                        <div className={`file-icon-container ${msg.file.ext}`}>
                          {msg.file.ext === "pdf" ? <span className="file-ext-tag">PDF</span> : <i className="fa-solid fa-file-excel excel-icon"></i>}
                        </div>
                        <div className="file-details">
                          <span className="file-name">{msg.file.name}</span>
                          <span className="file-info">{msg.file.size}</span>
                        </div>
                        <span className="message-time">
                          {msg.time} {isOutgoing && <i className="fa-solid fa-check-double read-status"></i>}
                        </span>
                      </div>
                    )}

                    {/* Tin nhắn hình ảnh */}
                    {msg.type === "image" && msg.image && (
                      <div className="message-bubble img-bubble">
                        <img src={msg.image} alt="Đính kèm" className="chat-attached-image" />
                        <span className="message-time">{msg.time}</span>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            );
          })}

          <div ref={chatMessagesEndRef} />
        </div>

        {/* Vùng gõ tin nhắn */}
        <div className="chat-main-input">
          <div className="input-actions-left">
            <button className="btn-input-action" title="Đính kèm tệp" onClick={handleAttachClick}>
              <i className="fa-solid fa-paperclip"></i>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: "none" }} 
              onChange={handleFileChange} 
            />
            <button className="btn-input-action" title="Biểu cảm" onClick={() => alert("Tính năng chọn Emoji đang được phát triển.")}>
              <i className="fa-regular fa-smile"></i>
            </button>
          </div>
          <div className="input-text-container">
            <input
              type="text"
              placeholder="Nhập tin nhắn..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
          </div>
          <button className="btn-send-message-sh" onClick={() => handleSendMessage()}>Gửi</button>
        </div>
      </section>

      {/* ==========================================================================
         CỘT 4: SIDEBAR DETAIL (Thông tin nhóm)
         ========================================================================== */}
      <aside className={`sidebar-detail ${isDetailOpen ? '' : 'collapsed'}`}>
        <div className="detail-header">
          <h3>{activeChat.isGroup ? "Thông tin nhóm" : "Thông tin cá nhân"}</h3>
          <button className="btn-close-detail" title="Đóng" onClick={() => setIsDetailOpen(false)}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="detail-content">
          <div className="group-identity">
            <div className={`group-avatar-large ${activeChat.avatarClass || ''}`}>
              {activeChat.avatarHtml}
            </div>
            <h3 className="group-name-large">{activeChat.name}</h3>
            <span className="group-members-count">{activeChat.membersCount}</span>
          </div>

          {activeChat.isGroup && (
            <div className="detail-section">
              <h4 className="section-title">Mô tả nhóm</h4>
              <p className="section-desc">{activeChat.description}</p>
            </div>
          )}

          {activeChat.isGroup && (
            <div className="detail-section">
              <h4 className="section-title">Quản trị viên</h4>
              <span className="admin-name">{activeChat.admin}</span>
            </div>
          )}

          <div className="detail-section members-section">
            <h4 className="section-title">{activeChat.isGroup ? `Thành viên (${activeChat.members.length})` : "Thông tin cá nhân"}</h4>
            <div className="members-list">
              {activeChat.members.map((member, idx) => (
                <div key={idx} className="member-item">
                  <img src={member.avatar} alt={member.name} className="member-avatar" />
                  <div className="member-info">
                    <span className="member-name">{member.name}</span>
                    <span className="member-status-text">
                      <span className={`status-dot ${member.online ? 'online' : 'offline'}`}></span>
                      {member.online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="detail-actions">
            <div className="action-row">
              <div className="action-label">
                <i className="fa-regular fa-bell"></i>
                <span>Tắt thông báo</span>
              </div>
              <label className="switch">
                <input type="checkbox" />
                <span className="slider round"></span>
              </label>
            </div>

            {activeChat.isGroup && (
              <button className="btn-leave-group" onClick={() => alert("Tính năng rời khỏi nhóm đang được liên kết hệ thống.")}>
                <i className="fa-solid fa-trash-can"></i>
                <span>Rời khỏi nhóm</span>
              </button>
            )}
          </div>
        </div>
      </aside>

    </div>
  );
}

export default App;

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { safeAddDoc, safeSetDoc, safeDeleteDoc, safeUpdateDoc } from '../lib/safeFirestore';
import { 
  MessageSquare, Send, Plus, Search, Trash2, CheckCheck, 
  User, ShieldAlert, Clock, ArrowLeft, RefreshCw, X, Sparkles, MessageCircle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import feedbackAvatarImg from '../assets/images/feedback_avatar_1786443979118.jpg';

interface MessageReply {
  sender: 'admin' | 'user';
  text: string;
  createdAt: string;
  senderName?: string;
  senderId?: string;
  senderEmail?: string;
}

interface ContactMessage {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  targetUserId?: string;
  targetUserEmail?: string;
  targetUserName?: string;
  subject?: string;
  message: string;
  status?: string;
  createdAt: string;
  replies?: MessageReply[];
  unreadUser?: boolean;
  unreadAdmin?: boolean;
  unreadTarget?: boolean;
}

interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  username?: string;
  photoURL?: string;
}

export const Messages: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialChatId = searchParams.get('chatId');

  const [messagesList, setMessagesList] = useState<ContactMessage[]>([]);
  const [activeMsg, setActiveMsg] = useState<ContactMessage | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New chat modal state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'user' | 'support'>('user');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedTargetUser, setSelectedTargetUser] = useState<UserProfile | null>(null);
  const [newSubject, setNewSubject] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [creatingMsg, setCreatingMsg] = useState(false);

  // Delete modal state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState<boolean>(false);

  // Mobile view state: 'list' or 'chat'
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load all user profiles for searching
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'profiles'), (snapshot) => {
      const profs = snapshot.docs.map(d => {
        const data = d.data();
        const email = data.email || '';
        const name = data.displayName || email.split('@')[0] || 'Foydalanuvchi';
        const photoURL = data.photoURL || (email ? `https://unavatar.io/${encodeURIComponent(email)}?fallback=https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0284c7&color=ffffff&bold=true` : '');
        return {
          id: d.id,
          email,
          displayName: name,
          username: data.username || email.split('@')[0] || '',
          photoURL
        };
      }).filter(p => p.id !== user.uid && p.email?.toLowerCase() !== user.email?.toLowerCase());
      setAllProfiles(profs);
    }, (err) => {
      console.warn("Profiles listen error:", err);
    });
    return () => unsub();
  }, [user]);

  // Fetch messages in real-time
  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(collection(db, 'contact_messages'), (snapshot) => {
      const allMsgs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as ContactMessage));

      // Filter messages for current user or admin
      const filtered = allMsgs.filter(m => {
        if (isAdmin) return true;
        const myEmail = user.email?.toLowerCase();
        const myUid = user.uid;

        const isSender = m.userId === myUid || (m.userEmail && myEmail && m.userEmail.toLowerCase() === myEmail);
        const isTarget = (m.targetUserId && m.targetUserId === myUid) || (m.targetUserEmail && myEmail && m.targetUserEmail.toLowerCase() === myEmail);

        return isSender || isTarget;
      });

      // Sort by newest first
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setMessagesList(filtered);
    }, (err) => {
      console.warn("Contact messages listen error:", err);
    });

    return () => unsub();
  }, [user, isAdmin]);

  // Sync activeMsg with messagesList and searchParam
  useEffect(() => {
    if (messagesList.length === 0) {
      setActiveMsg(null);
      return;
    }

    if (initialChatId) {
      const found = messagesList.find(m => m.id === initialChatId);
      if (found) {
        setActiveMsg(found);
        setMobileView('chat');
        return;
      }
    }

    // Keep current activeMsg up to date if exists
    if (activeMsg) {
      const updated = messagesList.find(m => m.id === activeMsg.id);
      if (updated) {
        setActiveMsg(updated);
        return;
      }
    }

    // Default to first chat if desktop or initial load
    if (!activeMsg && messagesList.length > 0) {
      setActiveMsg(messagesList[0]);
    }
  }, [messagesList, initialChatId]);

  // Auto-scroll to bottom of chat when activeMsg updates or replies change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMsg?.replies, activeMsg?.id]);

  // Mark unread user messages as read when activeMsg is viewed
  useEffect(() => {
    if (!activeMsg || !user) return;
    const myEmail = user.email?.toLowerCase();
    const isSender = activeMsg.userId === user.uid || (activeMsg.userEmail && myEmail && activeMsg.userEmail.toLowerCase() === myEmail);

    if (!isAdmin) {
      if (isSender && activeMsg.unreadUser) {
        const msgRef = doc(db, 'contact_messages', activeMsg.id);
        safeUpdateDoc(msgRef, { unreadUser: false }).catch(console.error);
      } else if (!isSender && activeMsg.unreadTarget) {
        const msgRef = doc(db, 'contact_messages', activeMsg.id);
        safeUpdateDoc(msgRef, { unreadTarget: false }).catch(console.error);
      }
    } else if (isAdmin && activeMsg.unreadAdmin) {
      const msgRef = doc(db, 'contact_messages', activeMsg.id);
      safeUpdateDoc(msgRef, { unreadAdmin: false }).catch(console.error);
    }
  }, [activeMsg, user, isAdmin]);

  const getUserAvatarUrl = (email?: string, name?: string, photoURL?: string) => {
    if (photoURL) return photoURL;
    if (!email && !name) return undefined;
    const displayName = name || email?.split('@')[0] || 'User';
    if (email) {
      return `https://unavatar.io/${encodeURIComponent(email)}?fallback=https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0284c7&color=ffffff&bold=true`;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0284c7&color=ffffff&bold=true`;
  };

  const getChatPartner = (m: ContactMessage) => {
    if (!user) return { name: 'Foydalanuvchi', email: '', photoURL: '', isSupport: false };
    const myUid = user.uid;
    const myEmail = user.email?.toLowerCase();

    const isSender = m.userId === myUid || (m.userEmail && myEmail && m.userEmail.toLowerCase() === myEmail);

    let name = '';
    let email = '';
    let isSupport = false;

    if (isSender) {
      if (m.targetUserName || m.targetUserEmail) {
        name = m.targetUserName || m.targetUserEmail?.split('@')[0] || 'Foydalanuvchi';
        email = m.targetUserEmail || '';
      } else {
        name = "Shikoyatlar va takliflar";
        email = 'admin@botforge.uz';
        isSupport = true;
      }
    } else {
      name = m.userName || m.userEmail?.split('@')[0] || 'Foydalanuvchi';
      email = m.userEmail || '';
    }

    if (email === 'admin@botforge.uz' || name === 'Shikoyatlar va takliflar') {
      isSupport = true;
    }

    const prof = allProfiles.find(p => p.email?.toLowerCase() === email.toLowerCase());
    const photoURL = prof?.photoURL || getUserAvatarUrl(email, name);

    return {
      name,
      email,
      photoURL,
      isSupport
    };
  };

  const renderPartnerAvatar = (partner: { name: string; email: string; photoURL?: string; isSupport?: boolean }, sizeClass = "w-10 h-10") => {
    if (partner.isSupport || partner.email === 'admin@botforge.uz' || partner.name === 'Shikoyatlar va takliflar') {
      return (
        <img 
          src={feedbackAvatarImg} 
          alt="Shikoyatlar va takliflar" 
          className={`${sizeClass} rounded-full object-cover shrink-0 border border-amber-500/30 shadow-sm`} 
          referrerPolicy="no-referrer" 
        />
      );
    }

    const avatarUrl = partner.photoURL || getUserAvatarUrl(partner.email, partner.name) || `https://ui-avatars.com/api/?name=${encodeURIComponent(partner.name || 'User')}&background=0284c7&color=ffffff&bold=true`;

    return (
      <img
        src={avatarUrl}
        alt={partner.name || 'User'}
        className={`${sizeClass} rounded-full object-cover shrink-0 border border-primary/20 shadow-sm`}
        referrerPolicy="no-referrer"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(partner.name || 'User')}&background=0284c7&color=ffffff&bold=true`;
        }}
      />
    );
  };

  const handleSelectChat = (msg: ContactMessage) => {
    setActiveMsg(msg);
    setSearchParams({ chatId: msg.id });
    setMobileView('chat');
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeMsg || !user) return;

    setSending(true);
    try {
      const msgRef = doc(doc(db, 'contact_messages', activeMsg.id).firestore, 'contact_messages', activeMsg.id);
      const existingReplies = activeMsg.replies || [];
      const newReply: MessageReply = {
        sender: isAdmin ? 'admin' : 'user',
        senderId: user.uid,
        senderEmail: user.email || '',
        text: replyText.trim(),
        createdAt: new Date().toISOString(),
        senderName: user.displayName || user.email?.split('@')[0] || (isAdmin ? 'Admin' : 'Foydalanuvchi')
      };

      const myEmail = user.email?.toLowerCase();
      const isSender = activeMsg.userId === user.uid || (activeMsg.userEmail && myEmail && activeMsg.userEmail.toLowerCase() === myEmail);

      const updateData: any = {
        replies: [...existingReplies, newReply],
        updatedAt: new Date().toISOString()
      };

      if (isAdmin) {
        updateData.unreadUser = true;
        updateData.unreadTarget = true;
      } else if (isSender) {
        updateData.unreadTarget = true;
        updateData.unreadAdmin = true;
      } else {
        updateData.unreadUser = true;
      }

      await safeSetDoc(msgRef, updateData, { merge: true });

      // Send notification to the partner
      const partner = getChatPartner(activeMsg);
      if (partner.email && partner.email !== 'admin@botforge.uz') {
        try {
          await safeAddDoc(collection(db, 'notifications'), {
            userEmail: partner.email,
            title: "Yangi xabar keldi",
            message: `${user.displayName || user.email?.split('@')[0]}: ${replyText.trim().substring(0, 50)}...`,
            type: 'chat_message',
            chatId: activeMsg.id,
            read: false,
            createdAt: new Date().toISOString()
          });
        } catch (nErr) {
          console.warn("Notification send error:", nErr);
        }
      }

      setReplyText('');
    } catch (err: any) {
      console.error("Reply error:", err);
      toast.error("Xabar yuborishda xatolik: " + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleCreateNewMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !user) return;

    setCreatingMsg(true);
    try {
      let targetId = '';
      let targetEmail = '';
      let targetName = '';

      if (chatMode === 'user') {
        if (selectedTargetUser) {
          targetId = selectedTargetUser.id;
          targetEmail = selectedTargetUser.email;
          targetName = selectedTargetUser.displayName || selectedTargetUser.username || selectedTargetUser.email;
        } else if (userSearchQuery.trim()) {
          targetEmail = userSearchQuery.trim();
          targetName = userSearchQuery.trim().split('@')[0];
        } else {
          toast.error("Iltimos, foydalanuvchi username yoki emailini kiriting");
          setCreatingMsg(false);
          return;
        }

        // Check if chat with this target already exists
        const existing = messagesList.find(m => 
          (targetId && (m.targetUserId === targetId || m.userId === targetId)) ||
          (targetEmail && (m.targetUserEmail?.toLowerCase() === targetEmail.toLowerCase() || m.userEmail?.toLowerCase() === targetEmail.toLowerCase()))
        );

        if (existing) {
          toast.info("Ushbu foydalanuvchi bilan mavjud suhbat ochildi");
          setIsNewModalOpen(false);
          setSearchParams({ chatId: existing.id });
          setActiveMsg(existing);
          setMobileView('chat');
          setCreatingMsg(false);
          return;
        }
      } else {
        targetName = "Shikoyatlar va takliflar";
      }

      const docRef = await safeAddDoc(collection(db, 'contact_messages'), {
        userId: user.uid,
        userEmail: user.email || '',
        userName: user.displayName || user.email?.split('@')[0] || 'Foydalanuvchi',
        targetUserId: targetId,
        targetUserEmail: targetEmail,
        targetUserName: targetName,
        subject: newSubject.trim() || (chatMode === 'user' ? `Suhbat: ${targetName}` : "Shikoyat va taklif"),
        message: newMessageText.trim(),
        status: 'open',
        createdAt: new Date().toISOString(),
        unreadAdmin: chatMode === 'support',
        unreadUser: false,
        unreadTarget: chatMode === 'user',
        replies: []
      });

      if (targetEmail) {
        try {
          await safeAddDoc(collection(db, 'notifications'), {
            userEmail: targetEmail,
            title: "Yangi shaxsiy xabar",
            message: `${user.displayName || user.email?.split('@')[0]}: ${newMessageText.trim().substring(0, 50)}...`,
            type: 'chat_message',
            chatId: docRef?.id,
            read: false,
            createdAt: new Date().toISOString()
          });
        } catch (nErr) {
          console.warn("Notification add error:", nErr);
        }
      }

      toast.success("Chat muvaffaqiyatli boshlandi!");
      setIsNewModalOpen(false);
      setNewSubject('');
      setNewMessageText('');
      setUserSearchQuery('');
      setSelectedTargetUser(null);

      if (docRef?.id) {
        setSearchParams({ chatId: docRef.id });
        setMobileView('chat');
      }
    } catch (err: any) {
      console.error("Create message error:", err);
      toast.error("Xabar yaratishda xatolik: " + err.message);
    } finally {
      setCreatingMsg(false);
    }
  };

  const triggerDeleteSingle = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDeleteSingle = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);

    try {
      setMessagesList(prev => prev.filter(m => m.id !== id));
      if (activeMsg?.id === id) {
        setActiveMsg(null);
        setMobileView('list');
      }
      await safeDeleteDoc(doc(db, 'contact_messages', id));
      toast.success("Suhbat o'chirildi");
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error("O'chirishda xatolik: " + err.message);
    }
  };

  const confirmDeleteAll = async () => {
    setShowDeleteAllModal(false);
    if (messagesList.length === 0) return;

    try {
      const toDelete = [...messagesList];
      setMessagesList([]);
      setActiveMsg(null);
      setMobileView('list');
      toast.success("Barcha suhbatlar o'chirildi");

      for (const m of toDelete) {
        await safeDeleteDoc(doc(db, 'contact_messages', m.id));
      }
    } catch (err: any) {
      console.error("Delete all error:", err);
      toast.error("O'chirishda xatolik: " + err.message);
    }
  };

  const filteredList = messagesList.filter(m => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (m.subject && m.subject.toLowerCase().includes(term)) ||
      (m.message && m.message.toLowerCase().includes(term)) ||
      (m.userEmail && m.userEmail.toLowerCase().includes(term)) ||
      (m.userName && m.userName.toLowerCase().includes(term))
    );
  });

  return (
    <div className="flex-1 flex flex-col md:flex-row h-[calc(100vh-4rem)] bg-background overflow-hidden relative">
      {/* LEFT SIDEBAR - CHAT LIST */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-border bg-card/60 backdrop-blur-md flex flex-col h-full ${
        mobileView === 'chat' ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-foreground text-lg leading-tight">Xabarlar</h1>
              <p className="text-xs text-muted-foreground">{messagesList.length} ta suhbat</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {messagesList.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDeleteAllModal(true)}
                className="text-xs text-red-400 hover:text-red-500 hover:bg-red-500/10 gap-1 px-2 h-8"
                title="Barcha suhbatlarni o'chirish"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tozalash</span>
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setIsNewModalOpen(true)}
              className="gap-1.5 shadow-md shadow-primary/20 text-xs font-semibold rounded-lg h-8"
            >
              <Plus className="w-4 h-4" />
              Yangi
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-border/50 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Suhbatlarni qidirish..."
              className="w-full bg-background border border-border/80 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/40 p-1">
          {filteredList.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MessageCircle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">Xabarlar mavjud emas</p>
              <p className="text-xs text-muted-foreground mb-4">
                {searchTerm ? 'Qidiruv bo‘yicha hech narsa topilmadi' : 'Muloqotni boshlash uchun yangi xabar yuboring'}
              </p>
              {!searchTerm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsNewModalOpen(true)}
                  className="gap-2 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Xabar yaratish
                </Button>
              )}
            </div>
          ) : (
            filteredList.map((m) => {
              const isSelected = activeMsg?.id === m.id;
              const partner = getChatPartner(m);
              const isSender = m.userId === user?.uid || (m.userEmail && user?.email && m.userEmail.toLowerCase() === user.email.toLowerCase());
              const hasUnread = isAdmin ? m.unreadAdmin : (isSender ? m.unreadUser : m.unreadTarget);

              const lastText = m.replies && m.replies.length > 0 
                ? m.replies[m.replies.length - 1].text 
                : m.message;
              const lastTime = m.replies && m.replies.length > 0
                ? m.replies[m.replies.length - 1].createdAt
                : m.createdAt;

              return (
                <div
                  key={m.id}
                  onClick={() => handleSelectChat(m)}
                  className={`p-3 rounded-xl cursor-pointer transition-all duration-200 relative group flex items-start gap-3 my-0.5 ${
                    isSelected 
                      ? 'bg-primary/10 border-l-4 border-primary text-foreground font-medium shadow-sm' 
                      : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {renderPartnerAvatar(partner, "w-10 h-10")}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h4 className="text-xs font-semibold text-foreground truncate">
                        {partner.name}
                      </h4>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground truncate mb-1">
                      {m.subject && <span className="text-foreground/80 font-medium mr-1">[{m.subject}]</span>}
                      {lastText}
                    </p>

                    <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="truncate">
                        {partner.email}
                      </span>
                      {hasUnread && (
                        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shrink-0 shadow-sm shadow-primary" />
                      )}
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => triggerDeleteSingle(m.id, e)}
                    title="Suhbatni o'chirish"
                    className="p-1.5 hover:text-red-500 text-muted-foreground/60 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT CHAT AREA */}
      <div className={`flex-1 flex flex-col h-full bg-background/40 relative ${
        mobileView === 'list' ? 'hidden md:flex' : 'flex'
      }`}>
        {activeMsg ? (
          <>
            {/* Chat Topbar */}
            <div className="p-3 md:p-4 border-b border-border bg-card/40 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileView('list')}
                  className="md:hidden p-1.5 rounded-lg hover:bg-muted text-foreground transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {(() => {
                  const partner = getChatPartner(activeMsg);
                  return (
                    <>
                      {renderPartnerAvatar(partner, "w-10 h-10")}

                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-foreground truncate">
                          {partner.name}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-2">
                          <span>{activeMsg.subject || 'Shaxsiy chat'}</span>
                          {partner.email && (
                            <>
                              <span className="text-border">•</span>
                              <span>{partner.email}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => triggerDeleteSingle(activeMsg.id)}
                  title="Suhbatni o'chirish"
                  className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Messages Log */}
            {(() => {
              const partner = getChatPartner(activeMsg);
              const myEmail = user?.email?.toLowerCase();
              const isInitialMsgFromMe = activeMsg.userId === user?.uid || (activeMsg.userEmail && myEmail && activeMsg.userEmail.toLowerCase() === myEmail);

              return (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Initial Message as first speech bubble */}
                  <div className={`flex flex-col max-w-xl ${isInitialMsgFromMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                    <div className={`p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm max-w-full break-words ${
                      isInitialMsgFromMe 
                        ? 'bg-primary text-primary-foreground rounded-tr-none' 
                        : 'bg-card border border-border/80 text-foreground rounded-tl-none'
                    }`}>
                      <div className="text-[10px] font-semibold mb-1 opacity-90 flex items-center justify-between gap-3">
                        <span>{isInitialMsgFromMe ? (user?.displayName || 'Siz') : (activeMsg.userName || partner.name)}</span>
                        {activeMsg.subject && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                            isInitialMsgFromMe ? 'bg-black/15 text-primary-foreground' : 'bg-primary/10 text-primary'
                          }`}>
                            {activeMsg.subject}
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap">{activeMsg.message}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 px-1 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(activeMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Replies */}
                  {activeMsg.replies && activeMsg.replies.map((r, idx) => {
                    const isMe = (() => {
                      if (!user) return false;
                      if (r.senderEmail && user.email && r.senderEmail.toLowerCase() === user.email.toLowerCase()) return true;
                      if (r.senderId && r.senderId === user.uid) return true;
                      if (isAdmin) return r.sender === 'admin';

                      if (isInitialMsgFromMe) {
                        return r.sender === 'user';
                      } else {
                        return r.sender === 'user' && r.senderName !== activeMsg.userName;
                      }
                    })();

                    return (
                      <div
                        key={idx}
                        className={`flex flex-col max-w-xl ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                      >
                        <div className={`p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm max-w-full break-words ${
                          isMe 
                            ? 'bg-primary text-primary-foreground rounded-tr-none' 
                            : 'bg-card border border-border/80 text-foreground rounded-tl-none'
                        }`}>
                          <div className="text-[10px] font-semibold mb-1 opacity-90 flex items-center gap-1.5">
                            {r.sender === 'admin' ? (
                              <span className="flex items-center gap-1 text-amber-400 font-bold">
                                <ShieldAlert className="w-3 h-3" /> Shikoyatlar va takliflar
                              </span>
                            ) : (
                              <span>{isMe ? (user?.displayName || 'Siz') : (r.senderName || partner.name)}</span>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap">{r.text}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 px-1 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}

                  <div ref={messagesEndRef} />
                </div>
              );
            })()}

            {/* Chat Reply Input Form */}
            <div className="p-3 md:p-4 border-t border-border bg-card/60 backdrop-blur-md shrink-0">
              <form onSubmit={handleSendReply} className="flex items-center gap-2 max-w-4xl mx-auto">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Xabar matnini kiriting..."
                  disabled={sending}
                  className="flex-1 bg-background border border-border/80 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
                />
                <Button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="gap-2 rounded-xl px-5 shadow-lg shadow-primary/20"
                >
                  {sending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Yuborish</span>
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Suhbat tanlanmagan</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Chap tomondagi ro‘yxatdan suhbatni tanlang yoki yangi xabar yuborish uchun pastdagi tugmani bosing.
            </p>
            <Button
              onClick={() => setIsNewModalOpen(true)}
              className="gap-2 shadow-lg shadow-primary/20"
            >
              <Plus className="w-4 h-4" />
              Yangi xabar yaratish
            </Button>
          </div>
        )}
      </div>

      {/* NEW CHAT MODAL */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl relative flex flex-col max-h-[90vh]">
            <button
              onClick={() => {
                setIsNewModalOpen(false);
                setSelectedTargetUser(null);
                setUserSearchQuery('');
              }}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground">Yangi Chat Boshlash</h3>
                <p className="text-xs text-muted-foreground">Foydalanuvchi yoki Shikoyatlar va takliflar bo'limi bilan suhbat</p>
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 p-1 bg-muted/50 rounded-xl mb-4 gap-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setChatMode('user');
                  setSelectedTargetUser(null);
                }}
                className={`py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
                  chatMode === 'user' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Shaxsiy Chat</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setChatMode('support');
                  setSelectedTargetUser(null);
                }}
                className={`py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
                  chatMode === 'support' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Shikoyatlar va takliflar</span>
              </button>
            </div>

            <form onSubmit={handleCreateNewMessage} className="space-y-4 flex-1 overflow-y-auto pr-1">
              {chatMode === 'support' && (
                <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <img 
                    src={feedbackAvatarImg} 
                    alt="Shikoyatlar va takliflar" 
                    className="w-11 h-11 rounded-full object-cover shrink-0 border border-amber-500/30 shadow-md" 
                    referrerPolicy="no-referrer" 
                  />
                  <div>
                    <h4 className="text-xs font-bold text-foreground">Shikoyatlar va takliflar bo'limi</h4>
                    <p className="text-[11px] text-muted-foreground">Adminlar va xizmat ko'rsatish jamoasiga to'g'ridan-to'g'ri xabar yuborish</p>
                  </div>
                </div>
              )}

              {chatMode === 'user' && (
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Foydalanuvchini Qidirish (Username yoki Email)
                  </label>

                  {selectedTargetUser ? (
                    <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/30 rounded-xl">
                      <div className="flex items-center gap-3 min-w-0">
                        <img 
                          src={getUserAvatarUrl(selectedTargetUser.email, selectedTargetUser.displayName, selectedTargetUser.photoURL)} 
                          alt={selectedTargetUser.displayName || 'User'} 
                          className="w-9 h-9 rounded-full object-cover shrink-0 border border-primary/30 shadow-sm"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{selectedTargetUser.displayName}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{selectedTargetUser.email}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedTargetUser(null)}
                        className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-background/80 text-xs"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          placeholder="Masalan: @shohjahon yoki ismoilov@gmail.com..."
                          className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                        />
                      </div>

                      {/* Filtered Users List */}
                      <div className="max-h-40 overflow-y-auto border border-border/60 rounded-xl divide-y divide-border/40 bg-background/50">
                        {(() => {
                          const searchResults = allProfiles.filter(p => {
                            if (!userSearchQuery.trim()) return true;
                            const q = userSearchQuery.toLowerCase().trim().replace(/^@/, '');
                            return (
                              p.displayName?.toLowerCase().includes(q) ||
                              p.username?.toLowerCase().includes(q) ||
                              p.email?.toLowerCase().includes(q)
                            );
                          });

                          if (searchResults.length === 0) {
                            return (
                              <div className="p-3 text-center">
                                <p className="text-xs text-muted-foreground mb-2">Platformada bu nomdagi foydalanuvchi topilmadi</p>
                                {userSearchQuery.trim() && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedTargetUser({
                                        id: '',
                                        email: userSearchQuery.trim(),
                                        displayName: userSearchQuery.trim().split('@')[0],
                                        username: userSearchQuery.trim().split('@')[0]
                                      });
                                    }}
                                    className="text-xs h-7 gap-1"
                                  >
                                    <span>📧 "{userSearchQuery.trim()}" ga xabar yuborish</span>
                                  </Button>
                                )}
                              </div>
                            );
                          }

                          return searchResults.slice(0, 5).map((p) => (
                            <div
                              key={p.id}
                              onClick={() => setSelectedTargetUser(p)}
                              className="p-2.5 hover:bg-primary/10 cursor-pointer flex items-center justify-between transition-colors text-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <img 
                                  src={getUserAvatarUrl(p.email, p.displayName, p.photoURL)} 
                                  alt={p.displayName || 'User'} 
                                  className="w-8 h-8 rounded-full object-cover shrink-0 border border-primary/20 shadow-sm"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="min-w-0">
                                  <p className="font-semibold text-foreground truncate">{p.displayName}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>
                                </div>
                              </div>
                              <span className="text-[10px] text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-md">Tanlash</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Xabar Mavzusi (Ixtiyoriy)
                </label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder={chatMode === 'user' ? "Masalan: Loyiha bo'yicha savol..." : "Masalan: Bot ishga tushmadi..."}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Xabar Matni
                </label>
                <textarea
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder="Xabaringizni yozing..."
                  rows={4}
                  required
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsNewModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Bekor qilish
                </Button>
                <Button
                  type="submit"
                  disabled={creatingMsg || !newMessageText.trim() || (chatMode === 'user' && !selectedTargetUser && !userSearchQuery.trim())}
                  className="rounded-xl text-xs gap-2 shadow-lg shadow-primary/20 font-semibold"
                >
                  {creatingMsg ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Chatni Boshlash</span>
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Single Chat Delete Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-card border border-destructive/30 rounded-2xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-2.5 bg-destructive/10 rounded-xl border border-destructive/20">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">Suhbatni o'chirish</h3>
                <p className="text-xs text-muted-foreground">Ushbu suhbat va uning tarixi o'chiriladi</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Ushbu suhbatni o'chirib tashlamoqchimisiz? Ushbu amalni ortga qaytarib bo'lmaydi.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-xl text-xs"
              >
                Bekor qilish
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 font-semibold rounded-xl text-xs"
                onClick={confirmDeleteSingle}
              >
                <Trash2 className="w-3.5 h-3.5" />
                O'chirish
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Chats Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-card border border-destructive/30 rounded-2xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-2.5 bg-destructive/10 rounded-xl border border-destructive/20">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">Barcha suhbatlarni tozalash</h3>
                <p className="text-xs text-muted-foreground">Jami {messagesList.length} ta suhbat o'chiriladi</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Rostdan ham BARCHA suhbatlar va ulardagi xabarlarni o'chirib tashlamoqchimisiz?
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteAllModal(false)}
                className="rounded-xl text-xs"
              >
                Bekor qilish
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 font-semibold rounded-xl text-xs"
                onClick={confirmDeleteAll}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Barchasini o'chirish
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Search, MessageSquare, Copy, Trash2, Paperclip, CheckCheck, Check, User, Send, ArrowLeft, Plus, X, Mail, Smile, Pin } from 'lucide-react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { safeSetDoc, safeAddDoc, safeDeleteDoc } from '../lib/safeFirestore';
import { toast } from 'sonner';
import EmojiPicker, { Theme, EmojiClickData } from 'emoji-picker-react';

interface ContactMsg {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
  read?: boolean;
  replies?: Array<{
    sender: 'admin' | 'user';
    text: string;
    createdAt: string;
    read?: boolean;
  }>;
}

export const Messages: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [contactMsgs, setContactMsgs] = useState<ContactMsg[]>([]);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [msgSearch, setMsgSearch] = useState('');
  const [chatReply, setChatReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creatingMsg, setCreatingMsg] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const handleCreateNewMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;

    setCreatingMsg(true);
    try {
      const docRef = await safeAddDoc(collection(db, 'contact_messages'), {
        name: newName.trim(),
        email: newEmail.trim(),
        message: '',
        createdAt: new Date().toISOString(),
        replies: []
      });

      toast.success("Yangi muloqot yaratildi!");
      if (docRef) setSelectedMsgId(docRef.id);
      setMobileView('chat');
      setNewName('');
      setNewEmail('');
      setIsNewModalOpen(false);
    } catch (err: any) {
      console.error("Create msg error:", err);
      toast.error("Xatolik yuz berdi: " + err.message);
    } finally {
      setCreatingMsg(false);
    }
  };

  const ADMIN_EMAIL = 'ismoilovshohjahon750@gmail.com';
  const ADMIN_NAME = 'IT & Toʻlov-Admin';

  useEffect(() => {
    if (!user) return;

    const unsubMsgs = onSnapshot(collection(db, 'contact_messages'), (snapshot) => {
      let msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ContactMsg));

      let adminMsg = msgs.find(m => m.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());

      if (adminMsg) {
        adminMsg.name = ADMIN_NAME;
      } else {
        adminMsg = {
          id: 'admin_pinned_chat',
          name: ADMIN_NAME,
          email: ADMIN_EMAIL,
          message: 'Assalomu alaykum! IT va To\'lov bo\'yicha savollaringiz bo\'lsa yozib qoldirishingiz mumkin.',
          createdAt: new Date().toISOString(),
          replies: []
        };
        msgs.unshift(adminMsg);
      }

      // Sort: Admin pinned message ALWAYS goes first (index 0)
      msgs.sort((a, b) => {
        const isAAdmin = a.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        const isBAdmin = b.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        if (isAAdmin && !isBAdmin) return -1;
        if (!isAAdmin && isBAdmin) return 1;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      setContactMsgs(msgs);
    }, (error) => {
      console.warn("Error fetching contact messages:", error);
    });

    return () => unsubMsgs();
  }, [user]);

  useEffect(() => {
    if (isNewModalOpen && user) {
      if (!newName) setNewName(user.displayName || user.email?.split('@')[0] || '');
      if (!newEmail) setNewEmail(user.email || '');
    }
  }, [isNewModalOpen, user]);

  const filteredContactMsgs = contactMsgs
    .map(m => m.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? { ...m, name: ADMIN_NAME } : m)
    .filter(m => 
      (m.name || '').toLowerCase().includes(msgSearch.toLowerCase()) ||
      (m.email || '').toLowerCase().includes(msgSearch.toLowerCase()) ||
      (m.message || '').toLowerCase().includes(msgSearch.toLowerCase())
    )
    .sort((a, b) => {
      const isAAdmin = a.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      const isBAdmin = b.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      if (isAAdmin && !isBAdmin) return -1;
      if (!isAAdmin && isBAdmin) return 1;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

  const activeMsg = contactMsgs.find(m => m.id === selectedMsgId) || (filteredContactMsgs.length > 0 ? filteredContactMsgs[0] : null);

  // Auto mark unread messages/replies as read when activeMsg is viewed
  useEffect(() => {
    if (!activeMsg || !user || activeMsg.id === 'admin_pinned_chat') return;

    const currentUserEmail = user.email?.toLowerCase();
    const isUserAdmin = currentUserEmail === ADMIN_EMAIL.toLowerCase();

    let needsUpdate = false;
    let newRead = activeMsg.read;

    // Check initial message read status:
    const isInitialFromOther = isUserAdmin 
      ? activeMsg.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
      : activeMsg.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    if (isInitialFromOther && !activeMsg.read && activeMsg.message) {
      newRead = true;
      needsUpdate = true;
    }

    // Check replies read status:
    const updatedReplies = (activeMsg.replies || []).map((r) => {
      const isReplyFromOther = isUserAdmin ? r.sender === 'user' : r.sender === 'admin';
      if (isReplyFromOther && !r.read) {
        needsUpdate = true;
        return { ...r, read: true };
      }
      return r;
    });

    if (needsUpdate) {
      const msgRef = doc(db, 'contact_messages', activeMsg.id);
      safeSetDoc(msgRef, {
        read: newRead ?? true,
        replies: updatedReplies
      }, { merge: true }).catch((err) => console.warn("Read status update error:", err));
    }
  }, [activeMsg?.id, activeMsg?.replies?.length, user?.email]);

  const getAvatarColor = (name: string) => {
    const colors = [
      'from-blue-500 to-indigo-600',
      'from-emerald-500 to-teal-600',
      'from-purple-500 to-pink-600',
      'from-amber-500 to-orange-600',
      'from-sky-500 to-blue-600',
      'from-rose-500 to-red-600'
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  };

  const handleDeleteContactMsg = async (id: string) => {
    try {
      if (id !== 'admin_pinned_chat') {
        await safeDeleteDoc(doc(db, 'contact_messages', id));
      }
      toast.success("Xabar o'chirildi");
      if (selectedMsgId === id) {
        setSelectedMsgId(null);
        setMobileView('list');
      }
    } catch (err: any) {
      toast.error("O'chirishda xatolik: " + err.message);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMsg || !chatReply.trim()) return;

    setSendingReply(true);
    try {
      if (activeMsg.id === 'admin_pinned_chat') {
        const docRef = await safeAddDoc(collection(db, 'contact_messages'), {
          name: ADMIN_NAME,
          email: ADMIN_EMAIL,
          message: '',
          createdAt: new Date().toISOString(),
          replies: [{
            sender: user?.email === ADMIN_EMAIL ? 'admin' : 'user',
            text: chatReply.trim(),
            createdAt: new Date().toISOString(),
            read: false
          }]
        });
        if (docRef) setSelectedMsgId(docRef.id);
      } else {
        const msgRef = doc(db, 'contact_messages', activeMsg.id);
        const existingReplies = activeMsg.replies || [];
        const newReply = {
          sender: user?.email === ADMIN_EMAIL ? 'admin' as const : 'user' as const,
          text: chatReply.trim(),
          createdAt: new Date().toISOString(),
          read: false
        };

        await safeSetDoc(msgRef, {
          replies: [...existingReplies, newReply]
        }, { merge: true });
      }

      toast.success("Xabar yuborildi!");
      setChatReply('');
      setShowEmojiPicker(false);
    } catch (err: any) {
      console.error("Send reply error:", err);
      toast.error("Javob yuborishda xatolik: " + err.message);
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="w-full h-full flex-1 flex flex-col overflow-hidden text-foreground font-sans bg-background">
      <div className="flex-1 flex flex-col overflow-hidden w-full h-full">
        {/* Messenger Main Layout (Split View) */}
        {contactMsgs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground bg-background/30">
            <div className="w-16 h-16 rounded-2xl bg-card flex items-center justify-center mb-4 text-primary shadow-lg">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">Xabarlar mavjud emas</h3>
            <p className="text-sm max-w-sm text-center text-muted-foreground">
              Saytdan yoki tarif obunasidan kelgan xabarlar shu yerda BotForge chat ko'rinishida namoyon bo'ladi.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            
            {/* LEFT PANEL: Chat List */}
            <div className={`w-full md:w-80 lg:w-96 bg-card/20 border-r border-border/40 flex flex-col shrink-0 ${
              mobileView === 'chat' ? 'hidden md:flex' : 'flex'
            }`}>
              {/* Chat List Search Bar */}
              <div className="p-3 bg-transparent border-b border-border/20">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={msgSearch}
                    onChange={(e) => setMsgSearch(e.target.value)}
                    placeholder="Xabarlarni qidirish..."
                    className="w-full pl-9 pr-3 py-2 rounded-2xl bg-muted/40 focus:bg-muted/70 text-xs text-foreground placeholder:text-muted-foreground border-0 focus:outline-none focus:ring-0 transition-all"
                  />
                </div>
              </div>

              {/* Chat Items Scroll List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredContactMsgs.map((m) => {
                  const isSelected = m.id === (activeMsg?.id);
                  const isPinnedAdmin = m.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
                  const displayName = isPinnedAdmin ? ADMIN_NAME : (m.name || 'Foydalanuvchi');
                  const avatarBg = isPinnedAdmin ? 'from-amber-500 to-orange-600' : getAvatarColor(displayName);
                  const initials = isPinnedAdmin ? 'IT' : displayName.substring(0, 2).toUpperCase();
                  const isTariffReq = m.message.includes('[TARIF SO\'ROVI');
                  const cleanMsg = m.message.replace(/\[TARIF SO'ROVI:[^\]]+\]/g, '').trim();

                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        setSelectedMsgId(m.id);
                        setMobileView('chat');
                      }}
                      className={`p-3 rounded-2xl cursor-pointer transition-all flex items-center gap-3 relative group border-0 outline-none select-none ${
                        isSelected 
                          ? 'bg-primary/20 text-foreground font-medium' 
                          : 'hover:bg-muted/40 text-muted-foreground'
                      }`}
                    >
                      {/* User Avatar */}
                      <div className={`w-11 h-11 rounded-full bg-gradient-to-tr ${avatarBg} flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-md relative`}>
                        {initials}
                        {isPinnedAdmin && (
                          <div className="absolute -bottom-0.5 -right-0.5 bg-amber-500 text-black p-0.5 rounded-full shadow">
                            <Pin className="w-2.5 h-2.5 rotate-45 fill-black" />
                          </div>
                        )}
                      </div>

                      {/* Chat Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`font-semibold text-sm truncate ${isSelected ? 'text-foreground' : 'text-foreground/90'}`}>
                              {displayName}
                            </span>
                            {isPinnedAdmin && (
                              <span className="shrink-0 bg-amber-500/15 text-amber-500 text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 border border-amber-500/30">
                                <Pin className="w-2.5 h-2.5 rotate-45 fill-amber-500/30" />
                                <span>Qadalgan</span>
                              </span>
                            )}
                          </div>
                          <span className={`text-[11px] shrink-0 ${isSelected ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                            {(() => {
                              const lastReply = m.replies && m.replies.length > 0 ? m.replies[m.replies.length - 1] : null;
                              const displayTime = lastReply?.createdAt || m.createdAt;
                              return displayTime ? new Date(displayTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                            })()}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-xs truncate ${isSelected ? 'text-foreground/90' : 'text-muted-foreground'}`}>
                            {isTariffReq && <span className="text-primary font-medium mr-1">[Obuna]</span>}
                            {(() => {
                              const lastReply = m.replies && m.replies.length > 0 ? m.replies[m.replies.length - 1] : null;
                              const isLastFromMe = lastReply
                                ? ((lastReply.sender === 'admin' && user?.email === ADMIN_EMAIL) || (lastReply.sender === 'user' && user?.email !== ADMIN_EMAIL))
                                : (m.email?.toLowerCase() === user?.email?.toLowerCase());
                              const isRead = lastReply ? !!lastReply.read : !!m.read;

                              return (
                                <span className="inline-flex items-center gap-1 max-w-full truncate">
                                  {isLastFromMe && (
                                    isRead ? (
                                      <CheckCheck className="w-3.5 h-3.5 text-sky-400 shrink-0 inline" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0 inline" />
                                    )
                                  )}
                                  <span className="truncate">{lastReply ? lastReply.text : (cleanMsg || 'Suhbatni boshlang...')}</span>
                                </span>
                              );
                            })()}
                          </p>

                          {!isPinnedAdmin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteContactMsg(m.id);
                              }}
                              title="O'chirish"
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 text-destructive rounded-lg transition-opacity shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT PANEL: Active Chat Window */}
            {activeMsg ? (
              <div className={`flex-1 flex flex-col bg-background relative overflow-hidden ${
                mobileView === 'list' ? 'hidden md:flex' : 'flex'
              }`}>
                
                {/* Active Chat Header */}
                <div className="bg-card/50 px-4 md:px-6 py-3 flex items-center justify-between z-10 backdrop-blur-sm border-b border-border/40">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMobileView('list')}
                      className="md:hidden h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </Button>

                    {(() => {
                      const isActiveAdmin = activeMsg.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
                      const activeDisplayName = isActiveAdmin ? ADMIN_NAME : (activeMsg.name || 'Foydalanuvchi');
                      const activeAvatarBg = isActiveAdmin ? 'from-amber-500 to-orange-600' : getAvatarColor(activeDisplayName);
                      const activeInitials = isActiveAdmin ? 'IT' : activeDisplayName.substring(0, 2).toUpperCase();

                      return (
                        <>
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${activeAvatarBg} flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-md relative`}>
                            {activeInitials}
                            {isActiveAdmin && (
                              <div className="absolute -bottom-0.5 -right-0.5 bg-amber-500 text-black p-0.5 rounded-full shadow">
                                <Pin className="w-2.5 h-2.5 rotate-45 fill-black" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-sm text-foreground truncate">
                                {activeDisplayName}
                              </h3>
                              {isActiveAdmin && (
                                <span className="bg-amber-500/15 text-amber-500 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 border border-amber-500/30 shrink-0">
                                  <Pin className="w-2.5 h-2.5 rotate-45 fill-amber-500/30" />
                                  <span>Qadalgan Admin</span>
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-primary font-medium truncate flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>
                              <span>{activeMsg.email}</span>
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-1 sm:gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(activeMsg.email);
                        toast.success("Nusxalandi!");
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 h-8 rounded-xl gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Nusxalash</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteContactMsg(activeMsg.id)}
                      className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-8 rounded-xl gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">O'chirish</span>
                    </Button>
                  </div>
                </div>

                {/* Messages Wallpaper Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-background/50">
                  
                  {/* Date Header Pill */}
                  <div className="flex justify-center my-2">
                    <span className="bg-card/80 text-muted-foreground text-[11px] font-medium px-3 py-1 rounded-full shadow-sm border border-border/30">
                      {activeMsg.createdAt ? new Date(activeMsg.createdAt).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Bugun'}
                    </span>
                  </div>

                  {/* INCOMING INITIAL MESSAGE */}
                  {activeMsg.message && activeMsg.message.trim() !== '' && activeMsg.message !== 'Yangi suhbat' && (
                    <div className="flex justify-start">
                      <div className="max-w-xl bg-card text-card-foreground rounded-2xl rounded-tl-sm p-4 shadow-sm space-y-2 relative border border-border/40">
                        <div className="flex items-center justify-between gap-4 pb-1 text-xs border-b border-border/30">
                          <span className="font-bold text-primary flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" />
                            {activeMsg.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? ADMIN_NAME : (activeMsg.name || 'Foydalanuvchi')}
                          </span>
                          <span className="text-muted-foreground text-[11px]">
                            {activeMsg.createdAt ? new Date(activeMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>

                        <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground">
                          {activeMsg.message}
                        </div>

                        <div className="flex items-center justify-end text-[10px] text-muted-foreground pt-1 gap-1">
                          <CheckCheck className="w-3.5 h-3.5 text-primary" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* REPLIES IN CONVERSATION */}
                  {activeMsg.replies && activeMsg.replies.map((r, idx) => {
                    const isAdminReply = r.sender === 'admin';
                    const isMyReply = (isAdminReply && user?.email === ADMIN_EMAIL) || (!isAdminReply && user?.email !== ADMIN_EMAIL);
                    const senderLabel = isAdminReply ? ADMIN_NAME : (activeMsg.name || 'Foydalanuvchi');

                    if (isMyReply) {
                      return (
                        <div key={idx} className="flex justify-end">
                          <div className="max-w-xl bg-primary text-primary-foreground rounded-2xl rounded-tr-sm p-3.5 md:p-4 shadow-md space-y-1.5 relative">
                            <div className="flex items-center justify-between gap-4 pb-1 text-xs text-primary-foreground/90 font-semibold border-b border-primary-foreground/20">
                              <span>Siz ({user?.displayName || (user?.email === ADMIN_EMAIL ? ADMIN_NAME : 'Foydalanuvchi')})</span>
                              <span className="text-[10px] text-primary-foreground/80">
                                {r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>

                            <div className="text-sm leading-relaxed whitespace-pre-wrap">
                              {r.text}
                            </div>

                            <div className="flex items-center justify-end text-[10px] text-primary-foreground/80 gap-1 pt-0.5">
                              <span>Yuborildi</span>
                              <CheckCheck className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div key={idx} className="flex justify-start">
                          <div className="max-w-xl bg-card text-card-foreground rounded-2xl rounded-tl-sm p-3.5 md:p-4 shadow-sm space-y-1.5 relative border border-border/40">
                            <div className="flex items-center justify-between gap-4 pb-1 text-xs border-b border-border/30">
                              <span className="font-bold text-primary flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5" />
                                {senderLabel}
                              </span>
                              <span className="text-muted-foreground text-[11px]">
                                {r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>

                            <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground">
                              {r.text}
                            </div>

                            <div className="flex items-center justify-end text-[10px] text-muted-foreground pt-0.5 gap-1">
                              <CheckCheck className="w-3.5 h-3.5 text-primary" />
                            </div>
                          </div>
                        </div>
                      );
                    }
                  })}

                </div>

                {/* INPUT BAR AT BOTTOM (Telegram-style capsule) */}
                <div className="p-2.5 md:p-3 bg-card/80 backdrop-blur-md border-t border-border/40 relative">
                  {/* Emoji Picker Popup */}
                  {showEmojiPicker && (
                    <div
                      ref={emojiPickerRef}
                      className="absolute bottom-16 left-2 sm:left-4 z-50 shadow-2xl rounded-2xl overflow-hidden border border-border/60 animate-in fade-in slide-in-from-bottom-2 duration-200"
                    >
                      <EmojiPicker
                        theme={Theme.DARK}
                        onEmojiClick={(emojiData: EmojiClickData) => {
                          setChatReply((prev) => prev + emojiData.emoji);
                        }}
                        width={320}
                        height={380}
                        searchPlaceHolder="Emoji qidirish..."
                        previewConfig={{ showPreview: false }}
                      />
                    </div>
                  )}

                  <form onSubmit={handleSendReply} className="flex items-center gap-2.5">
                    {/* Rounded Input Capsule / Pill */}
                    <div className="flex-1 rounded-full bg-muted/60 focus-within:bg-muted/90 border border-border/40 focus-within:border-primary/60 flex items-center px-3 py-1.5 transition-all shadow-inner">
                      {/* Left Smile Icon */}
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker((prev) => !prev)}
                        className={`transition-colors p-1.5 rounded-full hover:bg-background/50 shrink-0 focus:outline-none ${
                          showEmojiPicker ? 'text-primary bg-background/60' : 'text-muted-foreground hover:text-primary'
                        }`}
                        title="Emoji tanlash"
                      >
                        <Smile className="w-5 h-5" />
                      </button>

                      {/* Text Input */}
                      <textarea
                        rows={1}
                        value={chatReply}
                        onChange={(e) => setChatReply(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendReply(e);
                          }
                        }}
                        placeholder="Message"
                        className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm border-0 focus:outline-none focus:ring-0 resize-none px-2 py-1.5 max-h-28 leading-normal"
                      />

                      {/* Right Paperclip Icon */}
                      <button
                        type="button"
                        onClick={() => toast.info("Fayl biriktirish tez orada ishga tushadi!")}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-full hover:bg-background/50 shrink-0 focus:outline-none"
                        title="Fayl biriktirish"
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Circular Send Button */}
                    <button
                      type="submit"
                      disabled={sendingReply || !chatReply.trim()}
                      className="w-11 h-11 rounded-full bg-gradient-to-tr from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-400 text-white flex items-center justify-center shrink-0 shadow-lg shadow-primary/25 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all focus:outline-none"
                    >
                      <Send className="w-5 h-5 ml-0.5" />
                    </button>
                  </form>
                </div>

              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground bg-background/30">
                Chatni tanlang
              </div>
            )}

          </div>
        )}
      </div>

      {/* FLOATING ACTION BUTTON (+) */}
      <button
        type="button"
        onClick={() => setIsNewModalOpen(true)}
        title="Yangi xabar yozish"
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-tr from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-400 text-white flex items-center justify-center shadow-2xl shadow-primary/40 hover:scale-105 active:scale-95 transition-all duration-500 ease-in-out focus:outline-none ring-2 ring-background/50 ${
          mobileView === 'chat'
            ? 'translate-y-28 opacity-0 pointer-events-none'
            : 'translate-y-0 opacity-100 pointer-events-auto'
        }`}
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* NEW MESSAGE MODAL */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border/60 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 relative animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg text-foreground">Yangi muloqot boshlash</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateNewMsg} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase">
                  Foydalanuvchi ismi
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Masalan: Shohjahon Ismoilov"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-muted/40 focus:bg-muted/70 text-sm text-foreground placeholder:text-muted-foreground border border-border/40 focus:border-primary focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase">
                  Email yoki Telefon raqami
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@example.com yoki +998..."
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-muted/40 focus:bg-muted/70 text-sm text-foreground placeholder:text-muted-foreground border border-border/40 focus:border-primary focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsNewModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Bekor qilish
                </Button>
                <Button
                  type="submit"
                  disabled={creatingMsg || !newName.trim() || !newEmail.trim()}
                  className="rounded-xl text-xs gap-2 bg-primary hover:bg-primary/90 shadow-md shadow-primary/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  Yaratish
                </Button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
};


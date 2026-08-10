import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Bell, Check, Trash2, AlertTriangle, Crown, Zap, Info, ShieldAlert } from 'lucide-react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export interface AppNotification {
  id: string;
  userId: string;
  userEmail?: string;
  title: string;
  message: string;
  type?: 'due_warning' | 'sub_assigned' | 'admin_alert' | string;
  createdAt: string;
  read: boolean;
}

export const NotificationBell: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewAlert, setHasNewAlert] = useState(false);
  const [hasPromptedNative, setHasPromptedNative] = useState(false);

  // Request browser notification permission for phone system panel
  const requestNativeNotificationPermission = async () => {
    if ('Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          toast.success("Telefon tizim bildirishnomalari yoqildi!");
          new Notification("Bildirishnomalar Faol!", {
            body: "Endi obuna va to'lov kunlari xabari to'g'ridan-to'g'ri telefoningiz bildirishnoma panelida chiqadi.",
            icon: "/favicon.ico"
          });
        } else {
          toast.info("Telefon bildirishnomasiga ruxsat berilmadi.");
        }
      } catch (e) {
        console.warn("Notification permission error:", e);
      }
    } else {
      toast.error("Brauzeringiz tizim bildirishnomalarini qo'llab-quvvatlamaydi");
    }
  };

  useEffect(() => {
    if (!user) return;

    // Fetch user or admin notifications
    const q = query(
      collection(db, 'notifications')
    );

    let initialLoad = true;

    const unsub = onSnapshot(q, (snapshot) => {
      const all: AppNotification[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as AppNotification));

      // Filter relevant notifications for current user or admin
      const relevant = all.filter(n => {
        if (isAdmin && (n.userId === 'admin' || n.type === 'due_warning')) return true;
        if (n.userId === user.uid) return true;
        if (n.userEmail && user.email && n.userEmail.toLowerCase() === user.email.toLowerCase()) return true;
        return false;
      });

      // Sort by createdAt desc
      relevant.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Check for new unread items
      const unreads = relevant.filter(n => !n.read);
      if (unreads.length > 0) {
        setHasNewAlert(true);

        // If newly added in real-time after initial load, fire native phone system notification!
        if (!initialLoad && 'Notification' in window && Notification.permission === 'granted') {
          const latest = unreads[0];
          try {
            new Notification(latest.title, {
              body: latest.message,
              icon: '/favicon.ico'
            });
          } catch (e) {
            console.warn("Failed to fire native notification:", e);
          }
        }
      }

      setNotifications(relevant);
      initialLoad = false;
    }, (error) => {
      console.warn("Notification snapshot warning:", error);
    });

    return () => unsub();
  }, [user, isAdmin]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = async () => {
    setHasNewAlert(false);
    for (const n of notifications) {
      if (!n.read) {
        try {
          await updateDoc(doc(db, 'notifications', n.id), { read: true });
        } catch (e) {
          // ignore
        }
      }
    }
  };

  const markSingleRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (e) {
      console.error(e);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
      toast.success("Bildirishnoma o'chirildi");
    } catch (e) {
      console.error(e);
    }
  };

  if (!user) return null;

  return (
    <div className="relative z-50">
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) markAllRead();
        }}
        className="relative p-2 rounded-xl border border-border/60 bg-card hover:bg-muted/80 text-foreground transition-all focus:outline-none shrink-0 flex items-center justify-center"
        title="Bildirishnomalar va ogohlantirishlar"
      >
        <Bell className="w-4 h-4 text-foreground" />
        
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white shadow-lg animate-pulse"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      {/* Popover Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <span className="font-bold text-sm">Bildirishnomalar</span>
                  {unreadCount > 0 && (
                    <span className="text-xs bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full font-bold">
                      {unreadCount} ta yangi
                    </span>
                  )}
                </div>

                {notifications.length > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Barchasi o'qildi
                  </button>
                )}
              </div>

              {/* Native Push Request Banner */}
              {typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && (
                <div className="px-3 py-2 bg-primary/10 border-b border-primary/20 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-foreground leading-tight">
                    📱 Telefoningiz bildirishnoma panelida xabarlar chiqishi uchun ruxsat bering
                  </span>
                  <button
                    onClick={requestNativeNotificationPermission}
                    className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all shadow-sm"
                  >
                    Yoqish
                  </button>
                </div>
              )}

              {/* List */}
              <div className="max-h-96 overflow-y-auto divide-y divide-border/40">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    <Info className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                    Hozircha bildirishnomalar yo'q
                  </div>
                ) : (
                  notifications.map((n) => {
                    const isDueWarning = n.type === 'due_warning';
                    return (
                      <div
                        key={n.id}
                        className={`p-3.5 transition-colors flex gap-3 items-start relative ${
                          !n.read ? 'bg-amber-500/5 dark:bg-amber-500/10' : 'hover:bg-muted/30'
                        }`}
                      >
                        {/* Type Icon */}
                        <div className={`p-2 rounded-xl shrink-0 ${
                          isDueWarning 
                            ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                            : 'bg-primary/10 text-primary border border-primary/20'
                        }`}>
                          {isDueWarning ? <AlertTriangle className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
                        </div>

                        {/* Text Content */}
                        <div className="flex-1 min-w-0 pr-6">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-bold text-xs text-foreground truncate">{n.title}</span>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 inline-block" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground leading-snug whitespace-pre-wrap">
                            {n.message}
                          </p>
                          <span className="text-[10px] text-muted-foreground/70 mt-1 block">
                            {n.createdAt ? new Date(n.createdAt).toLocaleString('uz-UZ') : ''}
                          </span>
                        </div>

                        {/* Actions */}
                        <button
                          onClick={() => deleteNotification(n.id)}
                          className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="O'chirish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

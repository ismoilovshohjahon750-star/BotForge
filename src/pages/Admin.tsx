import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Shield, Search, UserCheck, Crown, Zap, Bot, MessageSquare, Save, RefreshCw, Copy, Check, Calendar, BellRing, Send } from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Profile, Bot as BotType, PlanType } from '../types';
import { toast } from 'sonner';
import { Input } from '../components/ui/input';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';

interface SubDetail {
  plan: PlanType;
  assignedDateFormatted?: string; // kun.oy.yil (e.g. 06.08.2026)
  dueDateFormatted?: string;      // kun.oy.yil (e.g. 06.09.2026)
  assignedAt?: string;
  dueDateISO?: string;
}

interface ContactMsg {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

export const Admin: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, PlanType>>({});
  const [subDetails, setSubDetails] = useState<Record<string, SubDetail>>({});
  const [bots, setBots] = useState<BotType[]>([]);
  const [contactMsgs, setContactMsgs] = useState<ContactMsg[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [sendingNotifyId, setSendingNotifyId] = useState<string | null>(null);
  const [selectedPlans, setSelectedPlans] = useState<Record<string, PlanType>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    // Fetch initial user list from server API (includes auth users)
    const fetchApiUsers = async () => {
      try {
        const token = await user?.getIdToken();
        const res = await fetch('/api/admin/users', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.users)) {
            setProfiles(prev => {
              const existingMap = new Map(prev.map(p => [p.id, p]));
              data.users.forEach((u: any) => {
                if (!existingMap.has(u.id)) {
                  existingMap.set(u.id, { id: u.id, email: u.email || '' });
                }
              });
              return Array.from(existingMap.values());
            });
            const apiSubs: Record<string, PlanType> = {};
            const apiDetails: Record<string, SubDetail> = {};
            data.users.forEach((u: any) => {
              if (u.plan) {
                apiSubs[u.id] = u.plan as PlanType;
                apiDetails[u.id] = {
                  plan: u.plan as PlanType,
                  assignedDateFormatted: u.assignedDateFormatted,
                  dueDateFormatted: u.dueDateFormatted,
                  assignedAt: u.assignedAt,
                  dueDateISO: u.dueDateISO
                };
              }
            });
            setSubscriptions(prev => ({ ...apiSubs, ...prev }));
            setSubDetails(prev => ({ ...apiDetails, ...prev }));
          }
        }
      } catch (e) {
        console.warn("Failed to fetch admin users API:", e);
      }
    };
    fetchApiUsers();

    // 1. Fetch Profiles
    const unsubProfiles = onSnapshot(collection(db, 'profiles'), (snapshot) => {
      const profs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Profile));
      setProfiles(prev => {
        const map = new Map(prev.map(p => [p.id, p]));
        profs.forEach(p => map.set(p.id, p));
        return Array.from(map.values());
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'profiles');
    });

    // 2. Fetch Subscriptions in Real-Time
    const unsubSubs = onSnapshot(collection(db, 'subscriptions'), (snapshot) => {
      const subsMap: Record<string, PlanType> = {};
      const detailsMap: Record<string, SubDetail> = {};

      snapshot.docs.forEach(d => {
        const data = d.data();
        const p = (data.plan as PlanType) || 'free';
        subsMap[d.id] = p;
        detailsMap[d.id] = {
          plan: p,
          assignedDateFormatted: data.assignedDateFormatted,
          dueDateFormatted: data.dueDateFormatted,
          assignedAt: data.assignedAt,
          dueDateISO: data.dueDateISO
        };
      });
      setSubscriptions(subsMap);
      setSubDetails(detailsMap);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'subscriptions');
    });

    // 3. Fetch Bots
    const unsubBots = onSnapshot(collection(db, 'bots'), (snapshot) => {
      setBots(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BotType)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bots');
    });

    // 4. Fetch Contact Messages
    const unsubMsgs = onSnapshot(collection(db, 'contact_messages'), (snapshot) => {
      setContactMsgs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ContactMsg)));
    }, (error) => {
      // Ignore if collection not created yet
    });

    return () => {
      unsubProfiles();
      unsubSubs();
      unsubBots();
      unsubMsgs();
    };
  }, [isAdmin, user]);

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success("ID buferga nusxalandi!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUpdateSubscription = async (targetUserId: string, planToSet?: PlanType) => {
    const targetPlan = planToSet || selectedPlans[targetUserId] || subscriptions[targetUserId] || 'free';
    setUpdatingUser(targetUserId);

    try {
      const token = await user?.getIdToken();

      // Update via Express API for backend verification and dates calculation
      const res = await fetch('/api/admin/set-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          targetUserId,
          plan: targetPlan
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Xatolik yuz berdi");
      }

      toast.success(data.message || `Foydalanuvchi obunasi ${targetPlan.toUpperCase()} ga muvaffaqiyatli o'zgartirildi!`);
    } catch (err: any) {
      console.error("Subscription update failed:", err);
      toast.error(err.message || "Obunani yangilashda xatolik yuz berdi");
    } finally {
      setUpdatingUser(null);
    }
  };

  // Send "To'lov kuni keldi" notification manually
  const handleSendDueNotification = async (targetUserId: string, targetEmail: string, plan: PlanType) => {
    setSendingNotifyId(targetUserId);
    try {
      const token = await user?.getIdToken();
      const res = await fetch('/api/admin/send-due-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          targetUserId,
          targetEmail,
          plan
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik yuz berdi");

      // Also create local notifications directly in Firestore for instant feedback
      const displayEmail = targetEmail || 'test@gmail.com';
      await addDoc(collection(db, 'notifications'), {
        userId: 'admin',
        userEmail: displayEmail,
        title: "To'lov Kuni Keldi!",
        message: `${displayEmail} nomli foydalanuvchini to'lov kuni keldi!`,
        type: 'due_warning',
        createdAt: new Date().toISOString(),
        read: false
      });

      if (targetUserId) {
        await addDoc(collection(db, 'notifications'), {
          userId: targetUserId,
          userEmail: displayEmail,
          title: "Obuna To'lov Kuni Keldi",
          message: `Hurmatli foydalanuvchi (${displayEmail}), sizning ${plan.toUpperCase()} obunangiz to'lov kuni keldi! Iltimos, obunani uzaytiring.`,
          type: 'due_warning',
          createdAt: new Date().toISOString(),
          read: false
        });
      }

      toast.success(`${displayEmail} nomli foydalanuvchini to'lov kuni keldi deb ogohlantirish yuborildi!`);
    } catch (err: any) {
      console.error("Send due notification failed:", err);
      toast.error(err.message || "Ogohlantirish yuborishda xatolik");
    } finally {
      setSendingNotifyId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <Shield className="w-16 h-16 text-destructive mx-auto mb-4 opacity-80" />
        <h2 className="text-2xl font-bold text-destructive">Ruxsat berilmagan</h2>
        <p className="text-muted-foreground mt-2">Ushbu bo'lim faqat tizim admini uchun mo'ljallangan.</p>
      </div>
    );
  }

  // Filter users by search
  const filteredProfiles = profiles.filter(p => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (p.email && p.email.toLowerCase().includes(query)) ||
      (p.id && p.id.toLowerCase().includes(query))
    );
  });

  const totalUsers = profiles.length;
  const proUsersCount = Object.values(subscriptions).filter(p => p === 'pro').length;
  const vipUsersCount = Object.values(subscriptions).filter(p => p === 'vip').length;
  const freeUsersCount = totalUsers - proUsersCount - vipUsersCount;

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Shield className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Admin Boshqaruv Paneli</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Foydalanuvchilar ro'yxati va obunalar (PRO / VIP) boshqaruvi
              </p>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="px-4 py-1.5 text-sm rounded-xl font-medium border-amber-500/30 text-amber-500 bg-amber-500/5 self-start md:self-auto">
          Super Admin: {user?.email}
        </Badge>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jami Foydalanuvchilar</CardDescription>
            <CardTitle className="text-3xl font-black">{totalUsers}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-muted-foreground">Ro'yxatdan o'tganlar</span>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-emerald-500">PRO Obunachilar</CardDescription>
            <CardTitle className="text-3xl font-black text-emerald-500">{proUsersCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-emerald-500/80">Max 10 ta bot limiti</span>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-amber-500">VIP Obunachilar</CardDescription>
            <CardTitle className="text-3xl font-black text-amber-500">{vipUsersCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-amber-500/80">Max 30 ta bot limiti</span>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jami Botlar</CardDescription>
            <CardTitle className="text-3xl font-black text-primary">{bots.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xs text-primary/80">{bots.filter(b => b.status === 'running').length} ta ishlayotgan bot</span>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-6 p-1 bg-muted/60 border rounded-xl">
          <TabsTrigger value="users" className="gap-2 rounded-lg font-semibold text-sm">
            <UserCheck className="w-4 h-4" />
            Foydalanuvchilar va Obunalar ({filteredProfiles.length})
          </TabsTrigger>
          <TabsTrigger value="bots" className="gap-2 rounded-lg font-semibold text-sm">
            <Bot className="w-4 h-4" />
            Botlar ({bots.length})
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-2 rounded-lg font-semibold text-sm">
            <MessageSquare className="w-4 h-4" />
            Xabarlar ({contactMsgs.length})
          </TabsTrigger>
        </TabsList>

        {/* USERS & SUBSCRIPTIONS TAB */}
        <TabsContent value="users">
          <Card className="border-border/60 shadow-lg">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <span>Foydalanuvchilar Ro'yxati</span>
                  <Badge variant="secondary" className="text-xs">{filteredProfiles.length} ta</Badge>
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  Har bir foydalanuvchiga Pro yoki VIP obunani osongina bering
                </CardDescription>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Email yoki ID bo'yicha qidiruv..."
                  className="pl-9 pr-4 bg-background/80 rounded-xl"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardHeader>

            <CardContent className="px-0 sm:px-6 pb-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-bold">Foydalanuvchi Email</TableHead>
                      <TableHead className="font-bold">User UID</TableHead>
                      <TableHead className="font-bold">Hozirgi Obuna</TableHead>
                      <TableHead className="font-bold">Berilgan Sana & To'lov Kuni (kun/oy/yil)</TableHead>
                      <TableHead className="font-bold text-center">Obunani Boshqarish</TableHead>
                      <TableHead className="font-bold text-right">Ogohlantirish</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          {searchQuery ? "Qidiruvga mos foydalanuvchi topilmadi" : "Hali foydalanuvchilar yo'q"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProfiles.map((p) => {
                        const currentPlan = subscriptions[p.id] || 'free';
                        const subInfo = subDetails[p.id] || {};
                        const isUpdating = updatingUser === p.id;
                        const isSendingNotify = sendingNotifyId === p.id;
                        const isSuperAdmin = p.email === 'ismoilovshohjahon750@gmail.com';

                        return (
                          <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                            <TableCell className="font-semibold text-sm">
                              <div className="flex items-center gap-2">
                                <span>{p.email || 'Email kiritilmagan'}</span>
                                {isSuperAdmin && (
                                  <Badge className="bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 border-amber-500/30 text-[10px] px-1.5 py-0">
                                    Admin
                                  </Badge>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="text-xs font-mono text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <span className="max-w-[120px] truncate" title={p.id}>{p.id}</span>
                                <button
                                  onClick={() => handleCopy(p.id)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title="ID dan nusxa olish"
                                >
                                  {copiedId === p.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </TableCell>

                            <TableCell>
                              {currentPlan === 'vip' ? (
                                <Badge className="bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold px-3 py-1 gap-1 shadow-sm">
                                  <Crown className="w-3.5 h-3.5" />
                                  VIP (30 bot)
                                </Badge>
                              ) : currentPlan === 'pro' ? (
                                <Badge className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold px-3 py-1 gap-1 shadow-sm">
                                  <Zap className="w-3.5 h-3.5" />
                                  PRO (10 bot)
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="px-3 py-1 text-muted-foreground font-medium">
                                  Bepul (2 bot)
                                </Badge>
                              )}
                            </TableCell>

                            {/* Dates Column */}
                            <TableCell>
                              <div className="flex flex-col text-xs gap-1">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Calendar className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                                  <span>Berilgan: </span>
                                  <span className="font-semibold text-foreground">
                                    {subInfo.assignedDateFormatted || (currentPlan !== 'free' ? '06.08.2026' : '-')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <BellRing className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span>To'lov kuni: </span>
                                  <span className="font-semibold text-amber-500">
                                    {subInfo.dueDateFormatted || (currentPlan !== 'free' ? '06.09.2026' : '-')}
                                  </span>
                                </div>
                              </div>
                            </TableCell>

                            {/* Plan Switchers */}
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isUpdating}
                                  variant={currentPlan === 'free' ? 'default' : 'outline'}
                                  onClick={() => handleUpdateSubscription(p.id, 'free')}
                                  className="h-8 text-xs font-medium rounded-lg px-2.5"
                                >
                                  Bepul
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isUpdating}
                                  variant={currentPlan === 'pro' ? 'default' : 'outline'}
                                  onClick={() => handleUpdateSubscription(p.id, 'pro')}
                                  className={`h-8 text-xs font-bold rounded-lg px-2.5 gap-1 ${
                                    currentPlan === 'pro' 
                                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                                      : 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10'
                                  }`}
                                >
                                  <Zap className="w-3 h-3" />
                                  PRO
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isUpdating}
                                  variant={currentPlan === 'vip' ? 'default' : 'outline'}
                                  onClick={() => handleUpdateSubscription(p.id, 'vip')}
                                  className={`h-8 text-xs font-bold rounded-lg px-2.5 gap-1 ${
                                    currentPlan === 'vip' 
                                      ? 'bg-amber-500 hover:bg-amber-400 text-black' 
                                      : 'border-amber-500/40 text-amber-500 hover:bg-amber-500/10'
                                  }`}
                                >
                                  <Crown className="w-3 h-3" />
                                  VIP
                                </Button>
                              </div>
                            </TableCell>

                            {/* Notification Trigger Column */}
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isSendingNotify}
                                onClick={() => handleSendDueNotification(p.id, p.email || '', currentPlan)}
                                className="h-8 text-xs font-semibold rounded-xl px-3 border-red-500/40 text-red-500 hover:bg-red-500/10 gap-1.5 shadow-sm transition-all"
                                title="To'lov kuni keldi deb xabar va ogohlantirish yuborish"
                              >
                                {isSendingNotify ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <BellRing className="w-3.5 h-3.5 text-red-500" />
                                )}
                                To'lov Kuni
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOTS TAB */}
        <TabsContent value="bots">
          <Card className="border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Barcha Yaratilgan Botlar</CardTitle>
              <CardDescription>Platformadagi barcha foydalanuvchilar botlari holati</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-bold">Bot Nomi</TableHead>
                    <TableHead className="font-bold">Bot ID</TableHead>
                    <TableHead className="font-bold">Ega (User ID)</TableHead>
                    <TableHead className="font-bold">Tili</TableHead>
                    <TableHead className="font-bold">Holati</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bots.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        Hozircha botlar yaratilmagan
                      </TableCell>
                    </TableRow>
                  ) : (
                    bots.map((b) => (
                      <TableRow key={b.id} className="hover:bg-muted/20">
                        <TableCell className="font-semibold text-sm">{b.name}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{b.id}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{b.userId}</TableCell>
                        <TableCell className="text-xs uppercase font-medium">{b.language || 'Node.js'}</TableCell>
                        <TableCell>
                          {b.status === 'running' ? (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-medium">
                              Ishlamoqda
                            </Badge>
                          ) : b.status === 'error' ? (
                            <Badge variant="destructive">Xatolik</Badge>
                          ) : (
                            <Badge variant="secondary">To'xtatilgan</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MESSAGES TAB */}
        <TabsContent value="messages">
          <Card className="border-border/60 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Aloqa Xabarlari</CardTitle>
              <CardDescription>Sayt orqali admin bilan bog'lanish shaklidan kelgan xabarlar</CardDescription>
            </CardHeader>
            <CardContent>
              {contactMsgs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Kelgan xabarlar mavjud emas
                </div>
              ) : (
                <div className="grid gap-4">
                  {contactMsgs.map((m) => (
                    <div key={m.id} className="p-4 rounded-xl border bg-card/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">{m.name} ({m.email})</span>
                        <span className="text-xs text-muted-foreground">
                          {m.createdAt ? new Date(m.createdAt).toLocaleString('uz-UZ') : ''}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap bg-muted/30 p-3 rounded-lg border border-border/40">
                        {m.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

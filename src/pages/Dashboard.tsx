import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Plus, Play, Square, RefreshCcw, FileUp, Terminal, Activity, FileText } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Bot, BotStatus, BotLog } from '../types';
import { toast } from 'sonner';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Terminal Real-Time Logs states
  const [selectedBotForLogs, setSelectedBotForLogs] = useState<Bot | null>(null);
  const [botLogs, setBotLogs] = useState<{type: string, message: string, createdAt: string}[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [logsIntervalId, setLogsIntervalId] = useState<any>(null);

  useEffect(() => {
    return () => {
      if (logsIntervalId) clearInterval(logsIntervalId);
    };
  }, [logsIntervalId]);

  const fetchLogs = async (botId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/bots/${botId}/logs`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setBotLogs(data.logs || []);
      }
    } catch (e) {
      console.error("Logs fetch failed:", e);
    }
  };

  const openBotLogs = async (bot: Bot) => {
    setSelectedBotForLogs(bot);
    setIsLogsLoading(true);
    await fetchLogs(bot.id);
    setIsLogsLoading(false);

    // Poll logs every 2.5 seconds
    if (logsIntervalId) clearInterval(logsIntervalId);
    const interval = setInterval(() => {
      fetchLogs(bot.id);
    }, 2500);
    setLogsIntervalId(interval);
  };

  const closeBotLogs = () => {
    if (logsIntervalId) {
      clearInterval(logsIntervalId);
      setLogsIntervalId(null);
    }
    setSelectedBotForLogs(null);
    setBotLogs([]);
  };

  const handleClearLogs = async (botId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/bots/${botId}/logs/clear`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        setBotLogs([]);
        toast.success("Loglar muvaffaqiyatli tozalandi");
      } else {
        toast.error("Loglarni tozalab bo'lmadi");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'bots'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const botsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bot));
      setBots(botsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bots');
    });

    return () => unsubscribe();
  }, [user]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;

    setIsUploading(true);
    try {
      // Create a Firestore document reference first to predetermine the ID
      const docRef = doc(collection(db, 'bots'));
      const botId = docRef.id;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', uploadName);

      const token = await user.getIdToken();
      const response = await fetch(`/api/bots/upload?id=${botId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      // Save to Firestore using the exact same ID so SQLite and Firestore match perfectly
      await setDoc(docRef, {
        userId: user.uid,
        name: result.data.name,
        language: result.data.language,
        status: 'stopped',
        entryPoint: result.data.entryPoint,
        createdAt: serverTimestamp()
      }, { merge: true });

      toast.success('Bot muvaffaqiyatli yuklandi');
      setUploadName('');
      setFile(null);
    } catch (error: any) {
      toast.error('Xatolik: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGithubImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl || !user) return;

    setIsImporting(true);
    try {
      const token = await user.getIdToken();

      // Create a Firestore document reference first to predetermine the ID
      const docRef = doc(collection(db, 'bots'));
      const botId = docRef.id;

      const response = await fetch('/api/bots/github-import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ repoUrl, id: botId })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      // Save to Firestore using the exact same ID so SQLite and Firestore match perfectly
      await setDoc(docRef, {
        userId: user.uid,
        name: result.data.name,
        language: result.data.language,
        status: 'stopped',
        entryPoint: result.data.entryPoint,
        createdAt: serverTimestamp()
      }, { merge: true });

      toast.success('Bot GitHub\'dan muvaffaqiyatli import qilindi');
      setRepoUrl('');
    } catch (error: any) {
      toast.error('Xatolik: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const toggleBot = async (bot: Bot) => {
    const newStatus = bot.status === 'running' ? 'stopped' : 'running';
    try {
      const token = await user?.getIdToken();
      await fetch(`/api/bots/${bot.id}/action`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: newStatus === 'running' ? 'start' : 'stop' })
      });

      await updateDoc(doc(db, 'bots', bot.id), {
        status: newStatus,
        uptimeStart: newStatus === 'running' ? serverTimestamp() : null
      });

      toast.success(`Bot ${newStatus === 'running' ? 'ishga tushirildi' : 'to\'xtatildi'}`);
    } catch (error: any) {
      toast.error('Xatolik: ' + error.message);
    }
  };

  const restartBot = async (bot: Bot) => {
    try {
      const token = await user?.getIdToken();
      toast.info(`Bot (${bot.name}) qayta ishga tushirilmoqda va muhi tahlil qilinmoqda...`);
      await fetch(`/api/bots/${bot.id}/action`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'restart' })
      });

      await updateDoc(doc(db, 'bots', bot.id), {
        status: 'running',
        uptimeStart: serverTimestamp()
      });

      toast.success(`Bot (${bot.name}) muvaffaqiyatli qayta ishga tushirildi!`);
    } catch (error: any) {
      toast.error('Xatolik: ' + error.message);
    }
  };

  if (loading) return <div className="p-20 text-center">Yuklanmoqda...</div>;

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold">Boshqaruv Paneli</h1>
          <p className="text-muted-foreground">Barcha botlaringiz va ularning holati</p>
        </div>
        
        <Dialog>
          <DialogTrigger render={<Button className="gap-2 rounded-xl" />}>
            <Plus className="w-4 h-4" />
            Yangi Bot
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yangi Bot Qo'shish</DialogTitle>
              <DialogDescription>
                Yangi botni yuklash usulini tanlang.
              </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">Zip Fayl</TabsTrigger>
                <TabsTrigger value="github">GitHub</TabsTrigger>
              </TabsList>
              <TabsContent value="upload">
                <form onSubmit={handleUpload} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bot nomi</label>
                    <Input 
                      placeholder="Mening Botim" 
                      value={uploadName} 
                      onChange={e => setUploadName(e.target.value)} 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Zip fayl</label>
                    <div className="border-2 border-dashed rounded-xl p-8 text-center hover:bg-primary/5 transition-colors cursor-pointer relative">
                      <input 
                        type="file" 
                        accept=".zip" 
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={e => setFile(e.target.files?.[0] || null)}
                      />
                      <FileUp className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {file ? file.name : "Faylni tanlang yoki shu yerga tashlang"}
                      </p>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isUploading}>
                    {isUploading ? "Yuklanmoqda..." : "Yuklash va Tekshirish"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="github" className="pt-4 space-y-4">
                <form onSubmit={handleGithubImport} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">GitHub Repository URL</label>
                    <Input 
                      placeholder="https://github.com/username/repo" 
                      value={repoUrl} 
                      onChange={e => setRepoUrl(e.target.value)} 
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full gap-2" disabled={isImporting}>
                    <Terminal className="w-4 h-4" />
                    {isImporting ? "Import qilinmoqda..." : "GitHub'dan import qilish"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-8">
        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Jami Botlar</CardDescription>
              <CardTitle className="text-2xl">{bots.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ishlayotgan</CardDescription>
              <CardTitle className="text-2xl text-primary">{bots.filter(b => b.status === 'running').length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>To'xtatilgan</CardDescription>
              <CardTitle className="text-2xl">{bots.filter(b => b.status === 'stopped').length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Botlar Ro'yxati</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomi</TableHead>
                  <TableHead>Til</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead className="text-right">Harakatlar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      Sizda hali botlar yo'q
                    </TableCell>
                  </TableRow>
                ) : (
                  bots.map((bot) => (
                    <TableRow key={bot.id}>
                      <TableCell className="font-medium">{bot.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase text-[10px]">
                          {bot.language}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={bot.status === 'running' ? 'default' : 'secondary'} className="gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${bot.status === 'running' ? 'bg-primary-foreground animate-pulse' : 'bg-muted-foreground'}`} />
                          {bot.status === 'running' ? 'Ishlayapti' : 'To\'xtatilgan'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {bot.uptimeStart ? "24/7" : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="icon" 
                            variant="outline" 
                            onClick={() => openBotLogs(bot)} 
                            title="Loglarni ko'rish"
                            className="text-zinc-400 hover:text-emerald-400 border-zinc-800"
                          >
                            <Terminal className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="outline" 
                            onClick={() => restartBot(bot)} 
                            title="Qayta ishga tushirish (Re-deploy)"
                            className="text-zinc-400 hover:text-blue-400 border-zinc-800"
                          >
                            <RefreshCcw className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="outline" onClick={() => toggleBot(bot)} title={bot.status === 'running' ? "To'xtatish" : "Ishga tushirish"} className="border-zinc-800">
                            {bot.status === 'running' ? <Square className="w-4 h-4 fill-current text-red-500" /> : <Play className="w-4 h-4 fill-current text-emerald-500" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Logs Terminal Dialog */}
      {selectedBotForLogs && (
        <Dialog open={!!selectedBotForLogs} onOpenChange={(open) => { if (!open) closeBotLogs(); }}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 rounded-2xl bg-zinc-950 border-zinc-800 text-zinc-100">
            <DialogHeader className="border-b border-zinc-900 pb-4">
              <div className="flex justify-between items-center pr-6">
                <div>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2 text-zinc-100">
                    <Terminal className="w-5 h-5 text-emerald-400 animate-pulse" />
                    <span>{selectedBotForLogs.name}</span>
                    <Badge variant="outline" className="text-[10px] border-zinc-850 bg-zinc-900 text-zinc-400 uppercase">
                      {selectedBotForLogs.language}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-zinc-500 text-xs mt-1">
                    Deploy va real-vaqt ish darajasidagi loglar paneli (live console).
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 text-xs gap-1.5 rounded-xl h-8"
                    onClick={() => handleClearLogs(selectedBotForLogs.id)}
                  >
                    Tozalash
                  </Button>
                  <Button
                    size="icon"
                    className={`rounded-xl h-8 w-8 ${
                      selectedBotForLogs.status === 'running' 
                        ? 'bg-red-950/40 text-red-400 hover:bg-red-950/60 border border-red-900/50' 
                        : 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/60 border border-emerald-900/50'
                    }`}
                    onClick={async () => {
                      await toggleBot(selectedBotForLogs);
                      // Update modal bot status state locally contextually
                      setSelectedBotForLogs(prev => prev ? { ...prev, status: prev.status === 'running' ? 'stopped' : 'running' } : null);
                    }}
                    title={selectedBotForLogs.status === 'running' ? "To'xtatish" : "Ishga tushirish"}
                  >
                    {selectedBotForLogs.status === 'running' ? (
                      <Square className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto bg-zinc-950 border border-zinc-900 font-mono text-xs rounded-xl p-4 min-h-[350px] max-h-[500px] space-y-2 select-text scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              {isLogsLoading ? (
                <div className="flex items-center justify-center p-20 text-zinc-500 gap-2">
                  <RefreshCcw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Loglar yuklanmoqda...</span>
                </div>
              ) : botLogs.length === 0 ? (
                <div className="text-zinc-600 text-center py-20 italic">
                  Chop etilgan loglar mavjud emas.<br />
                  <span className="text-[10px] text-zinc-700 not-italic block mt-1">Bot birinchi marotaba ishga tushganda yoki yangilanganida barcha jurnallar shu yerda chiqadi.</span>
                </div>
              ) : (
                botLogs.map((log, idx) => {
                  let badgeColor = "text-blue-400 bg-blue-950/30 border border-blue-900/30";
                  let prefix = "⚙️ SYSTEM";
                  if (log.type === "deploy") {
                    badgeColor = "text-purple-400 bg-purple-950/30 border border-purple-900/30";
                    prefix = "📦 DEPLOY";
                  } else if (log.type === "run") {
                    badgeColor = "text-emerald-400 bg-emerald-950/30 border border-emerald-900/30";
                    prefix = "🟢 RUN";
                  }

                  return (
                    <div key={idx} className="flex gap-3 hover:bg-zinc-900/30 py-1 px-1.5 rounded transition-colors group">
                      <span className="text-[10px] text-zinc-600 select-none min-w-[75px]">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold select-none h-fit ${badgeColor}`}>
                        {prefix}
                      </span>
                      <pre className="flex-1 text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed break-all">
                        {log.message}
                      </pre>
                    </div>
                  );
                })
              )}
            </div>
            
            <div className="flex justify-between items-center text-zinc-650 text-[10px] pt-4 border-t border-zinc-900 select-none">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${selectedBotForLogs.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-zinc-500">Ulanish statusi: <b>Active Polling (2.5s)</b></span>
              </div>
              <span className="text-zinc-600">Platform: BotForge v2.0-VPS-Ready</span>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

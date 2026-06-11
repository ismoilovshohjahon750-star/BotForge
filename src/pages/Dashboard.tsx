import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Plus, Play, Square, RefreshCcw, FileUp, Terminal, Activity, FileText } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
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
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', uploadName);

      const token = await user.getIdToken();
      const response = await fetch('/api/bots/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      // Botni Firestore ga yozish
      await addDoc(collection(db, 'bots'), {
        userId: user.uid,
        name: result.data.name,
        language: result.data.language,
        status: 'stopped',
        entryPoint: result.data.entryPoint,
        createdAt: serverTimestamp()
      });

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
      const response = await fetch('/api/bots/github-import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ repoUrl })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      // Botni Firestore ga yozish
      await addDoc(collection(db, 'bots'), {
        userId: user.uid,
        name: result.data.name,
        language: result.data.language,
        status: 'stopped',
        entryPoint: result.data.entryPoint,
        createdAt: serverTimestamp()
      });

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
                          <Button size="icon" variant="outline" onClick={() => toggleBot(bot)}>
                            {bot.status === 'running' ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
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
    </div>
  );
};

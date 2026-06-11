import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { User, Shield, Ban, CheckCircle2, Search } from 'lucide-react';
import { collection, onSnapshot, query, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Profile, Bot } from '../types';
import { toast } from 'sonner';
import { Input } from '../components/ui/input';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';

export const Admin: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;

    const unsubProfiles = onSnapshot(collection(db, 'profiles'), (snapshot) => {
      setProfiles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Profile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'profiles');
    });

    const unsubBots = onSnapshot(collection(db, 'bots'), (snapshot) => {
      setBots(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bot)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bots');
    });

    setLoading(false);
    return () => {
      unsubProfiles();
      unsubBots();
    };
  }, [isAdmin]);

  if (!isAdmin) return <div className="p-20 text-center text-destructive">Ruxsat berilmagan</div>;

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8 flex items-center gap-2">
        <Shield className="w-8 h-8 text-amber-500" />
        Admin Panel
      </h1>

      <div className="grid lg:grid-cols-3 gap-8 mb-12">
        <Card>
          <CardHeader>
            <CardTitle>Foydalanuvchilar</CardTitle>
            <CardDescription className="text-3xl font-bold">{profiles.length}</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Jami Botlar</CardTitle>
            <CardDescription className="text-3xl font-bold">{bots.length}</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Faol Botlar</CardTitle>
            <CardDescription className="text-3xl font-bold text-primary">{bots.filter(b => b.status === 'running').length}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Foydalanuvchilar Boshqaruvi</CardTitle>
            <CardDescription>Barcha ro'yxatdan o'tgan foydalanuvchilar</CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Qidiruv..." className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Sana</TableHead>
                <TableHead className="text-right">Harakatlar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.email}</TableCell>
                  <TableCell className="text-xs font-mono">{p.id}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{(p.createdAt as any)?.toDate?.()?.toISOString()?.split('T')[0] || p.createdAt}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="icon" variant="outline" className="text-destructive h-8 w-8">
                        <Ban className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

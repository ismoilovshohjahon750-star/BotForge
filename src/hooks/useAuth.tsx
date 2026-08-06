import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // 1. Profilni tekshirish muhandisligi
        const profileRef = doc(db, 'profiles', user.uid);
        let profileExists = false;
        try {
          const profileSnap = await getDoc(profileRef);
          profileExists = profileSnap.exists();
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, `profiles/${user.uid}`);
        }

        // 2. Profilni yaratish muhandisligi (agar mavjud bo'lmasa)
        if (!profileExists) {
          try {
            await setDoc(profileRef, {
              email: user.email || '',
              createdAt: serverTimestamp()
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `profiles/${user.uid}`);
          }
        }

        // 3. Rolni aniqlash va tekshirish muhandisligi
        if (user.email === 'ismoilovshohjahon750@gmail.com') {
          setIsAdmin(true);
        } else {
          const roleRef = doc(db, 'user_roles', user.uid);
          try {
            const roleSnap = await getDoc(roleRef);
            if (roleSnap.exists() && roleSnap.data().role === 'admin') {
              setIsAdmin(true);
            } else {
              setIsAdmin(false);
            }
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, `user_roles/${user.uid}`);
          }
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request') {
        console.warn('Kirish so\'rovi foydalanuvchi tomonidan bekor qilindi yoki bir nechta so\'rov yuborildi.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        console.warn('Foydalanuvchi oynani yopib qo\'ydi.');
      } else {
        console.error('Kirishda xatolik:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

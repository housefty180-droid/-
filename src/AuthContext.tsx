import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Use a fixed guest ID for "no login" mode so data persists for the user
  const guestUser: any = {
    uid: 'guest_user_default',
    email: 'guest@example.com',
    displayName: '访客用户',
    isAnonymous: true
  };

  const [user, setUser] = useState<FirebaseUser | null>(guestUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName ? currentUser.displayName.substring(0, 100) : null,
              createdAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.error("Error fetching or creating user:", err);
        }
      } else {
        setUser(guestUser);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.code === 'auth/popup-blocked') {
        setError("登录窗口被拦截，请允许弹出窗口。");
      } else if (err.code === 'auth/unauthorized-domain') {
        setError("当前域名未在 Firebase 控制台中授权。您可以继续以访客身份使用。");
      } else {
        setError("登录失败，请重试。错误: " + (err.message || "未知错误"));
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(guestUser); // Revert to guest on logout
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, error }}>
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

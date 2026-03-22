import React from 'react';
import { useAuth } from '../AuthContext';

export const Login: React.FC = () => {
  const { login, error } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-fridge-bg p-6">
      <div className="max-w-md w-full fridge-card p-12 text-center">
        <div className="w-28 h-28 bg-fridge-peach/20 rounded-fridge-lg flex items-center justify-center mx-auto mb-10 shadow-inner border border-fridge-peach/10">
          <span className="text-6xl">❄️</span>
        </div>
        <h1 className="text-4xl font-black tracking-tight mb-4 text-fridge-text">智能冰箱管家</h1>
        <p className="text-lg text-fridge-text-muted font-bold mb-8 leading-relaxed">管理您的食物，减少浪费，节省开支。</p>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-fridge border border-red-100 text-sm font-black animate-in fade-in slide-in-from-top-2">
            {error}
          </div>
        )}
        
        <button
          onClick={login}
          className="w-full bg-fridge-text text-white py-5 px-8 rounded-full font-black text-lg hover:bg-black transition-all flex items-center justify-center gap-4 shadow-2xl shadow-black/10 active:scale-95"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24">
            <path
              fill="white"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="white"
              fillOpacity="0.8"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="white"
              fillOpacity="0.6"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="white"
              fillOpacity="0.7"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          使用 Google 账号继续
        </button>
      </div>
    </div>
  );
};

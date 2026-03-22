import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Plus, Camera, BarChart2, LogOut, User } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { VoiceAssistant } from './VoiceAssistant';
import { motion, AnimatePresence } from 'motion/react';

export const Layout: React.FC = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="h-full bg-fridge-bg flex flex-col md:flex-row overflow-hidden font-sans text-fridge-text">
      {/* Sidebar for Desktop */}
      <nav className="hidden md:flex bg-white border-r border-black/5 w-72 flex-col justify-between z-10 p-8">
        <div>
          <div className="mb-12 flex items-center gap-4">
            <div className="w-12 h-12 bg-fridge-orange/10 rounded-2xl flex items-center justify-center text-fridge-orange shadow-sm">
              <span className="text-2xl">❄️</span>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-fridge-text">智能冰箱</h1>
              <p className="text-[10px] font-bold text-fridge-orange uppercase tracking-widest">Smart Manager</p>
            </div>
          </div>
          
          <div className="space-y-2">
            <DesktopNavItem to="/" icon={<Home size={20} />} label="我的冰箱" end />
            <DesktopNavItem to="/scan" icon={<Camera size={20} />} label="扫描小票" />
            <DesktopNavItem to="/stats" icon={<BarChart2 size={20} />} label="数据统计" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-fridge-bg p-4 rounded-fridge flex items-center gap-3 border border-black/5">
            <div className="w-10 h-10 bg-fridge-peach rounded-full flex items-center justify-center text-fridge-orange font-bold shadow-sm border-2 border-white">
              {user?.email?.[0].toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-fridge-text truncate">{user?.email?.split('@')[0]}</p>
              <p className="text-[10px] font-bold text-fridge-text-muted truncate">个人账户</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full p-4 text-fridge-text-muted hover:bg-red-50 hover:text-red-500 rounded-fridge transition-all duration-300 font-bold text-sm"
          >
            <LogOut size={18} />
            退出登录
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto relative pb-32 md:pb-0">
        <div className="max-w-6xl mx-auto p-6 md:p-12 safe-top">
          <Outlet />
        </div>
      </main>

      {/* Bottom Navigation for Mobile */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 z-50">
        <div className="bg-white/90 backdrop-blur-xl rounded-[32px] shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-black/5 p-2 flex items-center justify-between">
          <MobileNavItem to="/" icon={<Home size={22} />} label="主页" end />
          <MobileNavItem to="/stats" icon={<BarChart2 size={22} />} label="统计" />
          
          {/* Central FAB */}
          <div className="flex-1 flex justify-center -mt-12">
            <button 
              onClick={() => navigate('/add')}
              className="w-14 h-14 bg-fridge-orange text-white rounded-full shadow-[0_8px_25px_rgba(249,140,83,0.4)] flex items-center justify-center active:scale-90 transition-transform"
            >
              <Plus size={28} strokeWidth={3} />
            </button>
          </div>

          <MobileNavItem to="/scan" icon={<Camera size={22} />} label="扫描" />
          <button 
            onClick={logout}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-fridge-text-muted active:text-red-500 transition-all"
          >
            <LogOut size={22} />
            <span className="text-[10px] font-bold">退出</span>
          </button>
        </div>
      </nav>

      <VoiceAssistant />
    </div>
  );
};

const DesktopNavItem = ({ to, icon, label, end }: { to: string; icon: React.ReactNode; label: string; end?: boolean }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      `flex items-center gap-4 px-6 py-4 rounded-fridge transition-all duration-300 font-bold ${
        isActive
          ? 'bg-fridge-orange text-white shadow-lg shadow-fridge-orange/20'
          : 'text-fridge-text-muted hover:bg-fridge-bg hover:text-fridge-text'
      }`
    }
  >
    {icon}
    <span className="text-sm">{label}</span>
  </NavLink>
);

const MobileNavItem = ({ to, icon, label, end }: { to: string; icon: React.ReactNode; label: string; end?: boolean }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      `flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-300 ${
        isActive
          ? 'text-fridge-orange'
          : 'text-fridge-text-muted'
      }`
    }
  >
    {({ isActive }) => (
      <div className="flex flex-col items-center py-2">
        <div className={`transition-all duration-300 ${isActive ? 'scale-110' : 'opacity-60'}`}>
          {icon}
        </div>
        <span className={`text-[10px] font-bold tracking-tight transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-60'}`}>
          {label}
        </span>
      </div>
    )}
  </NavLink>
);
